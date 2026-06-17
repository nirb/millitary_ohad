import { Env } from './auth';
import { verifySession, createErrorResponse, createJSONResponse } from './helper';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const session = verifySession(context.request);
  if (!session) {
    return createErrorResponse('פג תוקף החיבור, אנא התחבר מחדש', 401);
  }

  try {
    const { results } = await context.env.DB.prepare(
      `SELECT t.id, t.inventory_id, t.transaction_type, t.quantity_changed, 
              t.full_name, t.phone_number, t.unit, t.destination, t.returned_quantity, 
              t.transaction_timestamp, t.created_by, i.product, i.category, i.quantity as current_quantity
       FROM transactions t
       JOIN inventory i ON t.inventory_id = i.id
       ORDER BY t.transaction_timestamp DESC
       LIMIT 150`
    ).all();

    return createJSONResponse(results);
  } catch (err: any) {
    return createErrorResponse(err.message || 'שגיאה בטעינת יומן התנועות', 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const session = verifySession(context.request);
  if (!session) {
    return createErrorResponse('פג תוקף החיבור, אנא התחבר מחדש', 401);
  }

  try {
    const body = await context.request.json() as {
      inventory_id: number;
      transaction_type: 'ADDITION' | 'SIGN_OUT' | 'DEDUCTION';
      quantity_changed: number;
      full_name?: string;
      phone_number?: string;
      unit?: string;
      destination?: string;
    };

    const {
      inventory_id,
      transaction_type,
      quantity_changed,
      full_name,
      phone_number,
      unit,
      destination,
    } = body;

    if (!inventory_id || !transaction_type || !quantity_changed || quantity_changed <= 0) {
      return createErrorResponse('נתונים חסרים או לא תקינים לביצוע התנועה');
    }

    // Check inventory existence & current quantity
    const item = (await context.env.DB.prepare(
      'SELECT quantity, product FROM inventory WHERE id = ?'
    )
      .bind(inventory_id)
      .first()) as { quantity: number; product: string } | null;

    if (!item) {
      return createErrorResponse('הפריט לא נמצא במלאי', 404);
    }

    let qtyDiff = 0;
    if (transaction_type === 'ADDITION') {
      qtyDiff = quantity_changed;
    } else if (transaction_type === 'SIGN_OUT' || transaction_type === 'DEDUCTION') {
      qtyDiff = -quantity_changed;
      // We allow checking count, but prevent negative values unless user wants to track shortfalls
      if (item.quantity + qtyDiff < 0) {
        return createErrorResponse(`אין מספיק מלאי למוצר זה. כמות נוכחית: ${item.quantity}`);
      }
    }

    if (transaction_type === 'SIGN_OUT' && (!full_name || !full_name.trim())) {
      return createErrorResponse('שם מלא הוא שדה חובה עבור החתמה');
    }

    // Execute in transaction using batch
    const updateInvStmt = context.env.DB.prepare(
      'UPDATE inventory SET quantity = quantity + ? WHERE id = ?'
    ).bind(qtyDiff, inventory_id);

    const insertTxStmt = context.env.DB.prepare(
      `INSERT INTO transactions (inventory_id, transaction_type, quantity_changed, full_name, phone_number, unit, destination, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      inventory_id,
      transaction_type,
      quantity_changed,
      full_name || null,
      phone_number || null,
      unit || null,
      destination || null,
      session.username
    );

    // Apply batch
    await context.env.DB.batch([updateInvStmt, insertTxStmt]);

    return createJSONResponse({ success: true, message: 'התנועה נרשמה בהצלחה' });
  } catch (err: any) {
    return createErrorResponse(err.message || 'שגיאה ברישום התנועה', 500);
  }
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const session = verifySession(context.request);
  if (!session) {
    return createErrorResponse('פג תוקף החיבור, אנא התחבר מחדש', 401);
  }

  try {
    const body = await context.request.json() as {
      transaction_id: number;
      return_quantity?: number;
      returned_quantity?: number;
    };

    const { transaction_id, return_quantity, returned_quantity } = body;

    if (!transaction_id) {
      return createErrorResponse('מזהה תנועה לא תקין');
    }

    // Get current transaction state
    const tx = (await context.env.DB.prepare(
      'SELECT inventory_id, quantity_changed, returned_quantity, transaction_type FROM transactions WHERE id = ?'
    )
      .bind(transaction_id)
      .first()) as { inventory_id: number; quantity_changed: number; returned_quantity: number; transaction_type: string } | null;

    if (!tx) {
      return createErrorResponse('התנועה לא נמצאה ביומן', 404);
    }

    if (tx.transaction_type !== 'SIGN_OUT') {
      return createErrorResponse('ניתן להחזיר ציוד רק עבור תנועות החתמה');
    }

    let R = 0;
    if (return_quantity !== undefined) {
      R = return_quantity;
    } else if (returned_quantity !== undefined) {
      R = returned_quantity - tx.returned_quantity;
    } else {
      return createErrorResponse('כמות החזרה לא תקינה');
    }

    if (R === 0) {
      return createJSONResponse({ success: true, message: 'אין שינוי בכמות ההחזרה' });
    }

    const newReturnedQuantity = tx.returned_quantity + R;

    if (newReturnedQuantity < 0) {
      return createErrorResponse('כמות מוחזרת כוללת לא יכולה להיות שלילית');
    }

    if (newReturnedQuantity > tx.quantity_changed) {
      return createErrorResponse(`כמות מוחזרת כוללת (${newReturnedQuantity}) לא יכולה לעלות על כמות ההחתמה המקורית (${tx.quantity_changed})`);
    }

    // Update inventory (increment by R)
    const updateInvStmt = context.env.DB.prepare(
      'UPDATE inventory SET quantity = quantity + ? WHERE id = ?'
    ).bind(R, tx.inventory_id);

    const updateTxStmt = context.env.DB.prepare(
      'UPDATE transactions SET returned_quantity = ? WHERE id = ?'
    ).bind(newReturnedQuantity, transaction_id);

    await context.env.DB.batch([updateInvStmt, updateTxStmt]);

    const isFullyReturned = newReturnedQuantity === tx.quantity_changed;
    return createJSONResponse({ 
      success: true, 
      message: isFullyReturned ? 'הציוד הוחזר במלואו וההחתמה הושלמה' : 'ההחזרה עודכנה והמלאי עודכן' 
    });
  } catch (err: any) {
    return createErrorResponse(err.message || 'שגיאה בעדכון החזרת הציוד', 500);
  }
};

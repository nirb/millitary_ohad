import { Env } from '../auth';
import { verifySession, createErrorResponse, createJSONResponse } from '../helper';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const session = verifySession(context.request);
  if (!session) {
    return createErrorResponse('פג תוקף החיבור, אנא התחבר מחדש', 401);
  }

  const itemId = context.params.id;
  if (!itemId) {
    return createErrorResponse('מזהה פריט חסר');
  }

  try {
    const data = await context.request.json() as {
      category?: string;
      product?: string;
      quantity?: number;
      container_capacity?: number | null;
      required_target?: number;
      notes?: string | null;
    };

    const category = data.category?.trim();
    const product = data.product?.trim();
    const quantity = data.quantity !== undefined ? data.quantity : undefined;
    const container_capacity = data.container_capacity !== undefined ? data.container_capacity : undefined;
    const required_target = data.required_target !== undefined ? data.required_target : undefined;
    const notes = data.notes !== undefined ? data.notes : undefined;

    // Build query dynamically based on provided fields
    const updates: string[] = [];
    const values: any[] = [];

    if (category) {
      updates.push('category = ?');
      values.push(category);
    }
    if (product) {
      updates.push('product = ?');
      values.push(product);
    }
    if (quantity !== undefined) {
      updates.push('quantity = ?');
      values.push(quantity);
    }
    if (container_capacity !== undefined) {
      updates.push('container_capacity = ?');
      values.push(container_capacity);
    }
    if (required_target !== undefined) {
      updates.push('required_target = ?');
      values.push(required_target);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes ? notes.trim() : null);
    }

    if (updates.length === 0) {
      return createErrorResponse('לא נשלחו שדות לעדכון');
    }

    values.push(itemId);

    const result = await context.env.DB.prepare(
      `UPDATE inventory SET ${updates.join(', ')} WHERE id = ? RETURNING id, category, product, quantity, container_capacity, required_target, gap, notes`
    )
      .bind(...values)
      .first();

    if (!result) {
      return createErrorResponse('הפריט לא נמצא במלאי', 404);
    }

    // Record transaction that a comprehensive update happened
    await context.env.DB.prepare(
      `INSERT INTO transactions (inventory_id, transaction_type, quantity_changed, full_name, unit)
       VALUES (?, 'UPDATE', 0, ?, 'מערכת')`
    )
      .bind(itemId, session.username)
      .run();

    return createJSONResponse(result);
  } catch (err: any) {
    return createErrorResponse(err.message || 'שגיאה בעדכון הפריט', 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const session = verifySession(context.request);
  if (!session) {
    return createErrorResponse('פג תוקף החיבור, אנא התחבר מחדש', 401);
  }

  const itemId = context.params.id;
  if (!itemId) {
    return createErrorResponse('מזהה פריט חסר');
  }

  try {
    const result = await context.env.DB.prepare(
      'DELETE FROM inventory WHERE id = ?'
    )
      .bind(itemId)
      .run();

    if (result.meta.changes === 0) {
      return createErrorResponse('הפריט לא נמצא במלאי', 404);
    }

    return createJSONResponse({ success: true, message: 'הפריט נמחק בהצלחה' });
  } catch (err: any) {
    return createErrorResponse(err.message || 'שגיאה במחיקת הפריט', 500);
  }
};

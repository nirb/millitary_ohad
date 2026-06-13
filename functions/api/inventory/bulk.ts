import { Env } from '../auth';
import { verifySession, createErrorResponse, createJSONResponse } from '../helper';

interface RawItem {
  category: string;
  product: string;
  quantity?: number | null;
  container_capacity?: number | null;
  required_target?: number | null;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const session = verifySession(context.request);
  if (!session) {
    return createErrorResponse('פג תוקף החיבור, אנא התחבר מחדש', 401);
  }

  try {
    const body = await context.request.json() as {
      items: RawItem[];
      clearExisting?: boolean;
    };

    const { items, clearExisting = false } = body;

    if (!Array.isArray(items)) {
      return createErrorResponse('מבנה נתונים לא תקין, מצפה למערך של פריטים');
    }

    const statements = [];

    if (clearExisting) {
      // Clear inventory (cascades to transactions)
      statements.push(context.env.DB.prepare('DELETE FROM inventory'));
    }

    const insertStmt = context.env.DB.prepare(
      `INSERT INTO inventory (category, product, quantity, container_capacity, required_target) 
       VALUES (?, ?, ?, ?, ?)`
    );

    for (const item of items) {
      const category = item.category?.trim();
      const product = item.product?.trim();
      
      // Clean quantity: default to 0 if null/undefined
      const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
      
      // Clean container capacity: null if undefined/null or empty
      const container_capacity = typeof item.container_capacity === 'number' ? item.container_capacity : null;
      
      // Clean required target: default to 0 if null/undefined
      const required_target = typeof item.required_target === 'number' ? item.required_target : 0;

      if (!category || !product) {
        continue; // skip invalid records
      }

      statements.push(
        insertStmt.bind(category, product, quantity, container_capacity, required_target)
      );
    }

    if (statements.length > 0) {
      await context.env.DB.batch(statements);
    }

    // Record bulk import transaction
    await context.env.DB.prepare(
      `INSERT INTO transactions (inventory_id, transaction_type, quantity_changed, unit, destination, created_by)
       SELECT id, 'ADDITION', quantity, 'מערכת', 'ייבוא ראשוני', ? FROM inventory`
    )
      .bind(session.username)
      .run()
      .catch(() => {}); // ignore transaction log failure for bulk insert if no items existed

    return createJSONResponse({ success: true, count: statements.length - (clearExisting ? 1 : 0) });
  } catch (err: any) {
    return createErrorResponse(err.message || 'שגיאה בייבוא הנתונים', 500);
  }
};

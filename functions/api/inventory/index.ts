import { Env } from '../auth';
import { verifySession, createErrorResponse, createJSONResponse } from '../helper';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const session = verifySession(context.request);
  if (!session) {
    return createErrorResponse('פג תוקף החיבור, אנא התחבר מחדש', 401);
  }

  try {
    const { results } = await context.env.DB.prepare(
      'SELECT id, category, product, quantity, container_capacity, required_target, gap FROM inventory ORDER BY category ASC, product ASC'
    ).all();

    return createJSONResponse(results);
  } catch (err: any) {
    return createErrorResponse(err.message || 'שגיאה בטעינת המלאי', 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const session = verifySession(context.request);
  if (!session) {
    return createErrorResponse('פג תוקף החיבור, אנא התחבר מחדש', 401);
  }

  try {
    const data = await context.request.json() as {
      category?: string;
      product?: string;
      quantity?: number;
      container_capacity?: number | null;
      required_target?: number;
    };

    const category = data.category?.trim();
    const product = data.product?.trim();
    const quantity = data.quantity ?? 0;
    const container_capacity = data.container_capacity ?? null;
    const required_target = data.required_target ?? 0;

    if (!category || !product) {
      return createErrorResponse('קטגוריה ושם מוצר הם שדות חובה');
    }

    // Insert inventory item
    const result = await context.env.DB.prepare(
      `INSERT INTO inventory (category, product, quantity, container_capacity, required_target) 
       VALUES (?, ?, ?, ?, ?) RETURNING id, category, product, quantity, container_capacity, required_target, gap`
    )
      .bind(category, product, quantity, container_capacity, required_target)
      .first();

    if (!result) {
      return createErrorResponse('שגיאה ביצירת הפריט במלאי', 500);
    }

    // Record the transaction as addition
    await context.env.DB.prepare(
      `INSERT INTO transactions (inventory_id, transaction_type, quantity_changed, full_name, unit)
       VALUES (?, 'ADDITION', ?, ?, 'מערכת')`
    )
      .bind(result.id, quantity, session.username)
      .run();

    return createJSONResponse(result, 201);
  } catch (err: any) {
    return createErrorResponse(err.message || 'שגיאה ביצירת הפריט', 500);
  }
};

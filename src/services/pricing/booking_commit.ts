import { db, localStore } from '../../config/database';
import { withOrderedLocks } from '../financial/ledger.service';

type BookingTable = 'trips' | 'tour_bookings' | 'deliveries';

/** Consume the locked quotation and insert the booking in the same transaction.
 * The callback validates the DATABASE row, never a process-local snapshot.
 */
export async function commitBooking(
  table: BookingTable, record: any, quoteId?: string | null,
  validate?: (quote: any) => any
): Promise<void> {
  await withOrderedLocks(quoteId ? [`booking-quote:${quoteId}`] : [], async () => {
    let consumed: any;
    await db.withTransaction(async (client) => {
      if (quoteId) {
        const quote = client
          ? (await client.query('SELECT * FROM price_quotations WHERE id = $1 FOR UPDATE', [quoteId])).rows[0]
          : localStore.price_quotations.get(quoteId);
        if (!quote || !validate) throw new Error('Quotation not found.');
        validate(quote);
        consumed = { ...quote, consumed: true, consumed_at: new Date().toISOString(),
          consumed_by: record.customer_id || record.sender_id };
        if (client) {
          const result = await client.query(
            `UPDATE price_quotations SET consumed = TRUE, consumed_at = CURRENT_TIMESTAMP, consumed_by = $2
             WHERE id = $1 AND consumed = FALSE AND expires_at > CURRENT_TIMESTAMP RETURNING id`,
            [quoteId, consumed.consumed_by]);
          if (result.rowCount !== 1) throw new Error('Quotation expired or already consumed.');
        }
      }
      if (client) {
        // Only fixed table names and database-owned column identifiers enter SQL.
        const columns = (await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          [table])).rows.map((r: any) => r.column_name as string);
        const keys = columns.filter((k: string) => record[k] !== undefined);
        if (!keys.includes('id')) throw new Error('Invalid booking record.');
        await client.query(`INSERT INTO ${table} (${keys.map((k: string) => `"${k}"`).join(',')})
          VALUES (${keys.map((_: string, i: number) => `$${i + 1}`).join(',')})`, keys.map((k: string) => record[k]));
      }
    });
    // No observable cache changes or dispatch before commit.
    if (consumed) localStore.price_quotations.set(quoteId!, consumed);
    localStore[table].set(record.id, record);
  });
}

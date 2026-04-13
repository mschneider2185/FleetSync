import { pool } from "../db";

function migLog(msg: string) {
  const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${t} [migration] ${msg}`);
}

export async function dedupAllocationBlocks(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows: duplicates } = await client.query<{
      scenario_id: number;
      frac_job_id: number;
      hauler_id: number;
      shift: string;
      start_date: string;
      end_date: string;
      count: number;
      ids: number[];
    }>(`
      SELECT scenario_id, frac_job_id, hauler_id,
             COALESCE(shift, 'both') AS shift,
             start_date, end_date,
             COUNT(*) AS count,
             ARRAY_AGG(id ORDER BY id ASC) AS ids
      FROM allocation_blocks
      GROUP BY scenario_id, frac_job_id, hauler_id, COALESCE(shift, 'both'), start_date, end_date
      HAVING COUNT(*) > 1
    `);

    if (duplicates.length === 0) {
      migLog("no duplicate allocation blocks found, nothing to do");
      return;
    }

    let removed = 0;
    for (const row of duplicates) {
      const keepId = row.ids[0];
      const removeIds = row.ids.slice(1);
      await client.query(
        `DELETE FROM allocation_blocks WHERE id = ANY($1)`,
        [removeIds]
      );
      migLog(
        `removed ${removeIds.length} duplicate(s) for hauler ${row.hauler_id}/frac ${row.frac_job_id}/scenario ${row.scenario_id} shift=${row.shift} ${row.start_date}–${row.end_date}, kept id=${keepId}`
      );
      removed += removeIds.length;
    }
    migLog(`dedup complete: removed ${removed} duplicate allocation block(s)`);
  } finally {
    client.release();
  }
}

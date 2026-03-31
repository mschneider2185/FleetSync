import { pool } from "../db";

function migLog(msg: string) {
  const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${t} [migration] ${msg}`);
}

export async function fixAllocAlignment(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows: misaligned } = await client.query<{
      scenario_id: number;
      frac_job_id: number;
      pad_name: string;
      day_delta: number;
    }>(`
      SELECT sub.scenario_id, sub.frac_job_id, fj.pad_name,
             (sub.planned_start_date::date - sub.min_alloc_start::date) AS day_delta
      FROM (
        SELECT sfs.scenario_id, sfs.frac_job_id, sfs.planned_start_date,
               MIN(ab.start_date) AS min_alloc_start
        FROM scenario_frac_schedules sfs
        JOIN allocation_blocks ab
          ON ab.frac_job_id = sfs.frac_job_id
         AND ab.scenario_id = sfs.scenario_id
        GROUP BY sfs.scenario_id, sfs.frac_job_id, sfs.planned_start_date
      ) sub
      JOIN frac_jobs fj ON fj.id = sub.frac_job_id
      WHERE (sub.planned_start_date::date - sub.min_alloc_start::date) > 1
      ORDER BY day_delta DESC
    `);

    if (misaligned.length === 0) {
      migLog("no misaligned allocation blocks found, nothing to do");
      return;
    }

    for (const row of misaligned) {
      const { scenario_id, frac_job_id, pad_name, day_delta } = row;
      const { rowCount } = await client.query(`
        UPDATE allocation_blocks
        SET start_date = (start_date::date + ($1 || ' days')::interval)::date::text,
            end_date   = (end_date::date   + ($1 || ' days')::interval)::date::text
        WHERE scenario_id = $2 AND frac_job_id = $3
      `, [day_delta, scenario_id, frac_job_id]);
      migLog(`shifted ${rowCount} block(s) for "${pad_name}" (scenario ${scenario_id}) forward ${day_delta} day(s)`);
    }
  } finally {
    client.release();
  }
}

"""view v_report_value_computed

DÒNG CHẢY LŨY KẾ (agg_type = sum)
  opening_balance (dòng gần nhất theo start_date của kỳ, COALESCE 0)
    + Σ this_period các kỳ TRƯỚC cùng (org_unit, indicator), chỉ counts_in_totals,
      tính từ kỳ của dòng số dư trở đi
  = acc_prev_computed
  + this_period của chính dòng này
  = acc_total_computed
  missing_periods = kỳ ở GIỮA (từ mốc số dư / kỳ đầu có số đến kỳ này) không có
                    báo cáo counts_in_totals

gstack-shortcut(dec-3bc0293c): kỳ 01/2027 sẽ cộng tiếp số 2026,
upgrade when Ban ATCL chốt Open Question 2 hoặc trước kỳ 01/2027
"""
from alembic import op

revision = "0002"
down_revision = "0001"

VIEW = """
CREATE VIEW v_report_value_computed AS
WITH counted AS (
    SELECT r.org_unit_id, rv.indicator_id, p.id AS period_id,
           p.start_date, rv.this_period
      FROM report_value rv
      JOIN report r           ON r.id  = rv.report_id
      JOIN workflow_state ws  ON ws.id = r.state_id AND ws.counts_in_totals
      JOIN reporting_period p ON p.id  = r.period_id
),
counted_reports AS (
    SELECT r.org_unit_id, r.template_id, r.period_id, p.start_date
      FROM report r
      JOIN workflow_state ws  ON ws.id = r.state_id AND ws.counts_in_totals
      JOIN reporting_period p ON p.id  = r.period_id
),
ctx AS (
    SELECT rv.report_id, rv.indicator_id, rv.this_period,
           r.org_unit_id, r.template_id, p.start_date,
           o.ob_start, o.ob_value
      FROM report_value rv
      JOIN indicator i        ON i.id  = rv.indicator_id AND i.agg_type = 'sum'
      JOIN report r           ON r.id  = rv.report_id
      JOIN reporting_period p ON p.id  = r.period_id
      LEFT JOIN LATERAL (
          SELECT op.start_date AS ob_start, o2.value AS ob_value
            FROM opening_balance o2
            JOIN reporting_period op ON op.id = o2.period_id
           WHERE o2.org_unit_id  = r.org_unit_id
             AND o2.indicator_id = rv.indicator_id
             AND op.start_date  <= p.start_date
           ORDER BY op.start_date DESC
           LIMIT 1
      ) o ON TRUE
)
SELECT c.report_id,
       c.indicator_id,
       a.acc_prev                                  AS acc_prev_computed,
       a.acc_prev + COALESCE(c.this_period, 0)     AS acc_total_computed,
       m.keys                                      AS missing_periods
  FROM ctx c
  CROSS JOIN LATERAL (
      SELECT COALESCE(c.ob_value, 0) + COALESCE((
                 SELECT SUM(k.this_period) FROM counted k
                  WHERE k.org_unit_id  = c.org_unit_id
                    AND k.indicator_id = c.indicator_id
                    AND k.start_date   < c.start_date
                    AND k.start_date  >= COALESCE(c.ob_start, '-infinity'::date)
             ), 0) AS acc_prev
  ) a
  CROSS JOIN LATERAL (
      SELECT COALESCE(array_agg(mp.period_key ORDER BY mp.start_date),
                      ARRAY[]::varchar[]) AS keys
        FROM reporting_period mp
       WHERE mp.template_id = c.template_id
         AND mp.start_date  < c.start_date
         AND mp.start_date >= COALESCE(c.ob_start, (
                 SELECT MIN(k2.start_date) FROM counted k2
                  WHERE k2.org_unit_id  = c.org_unit_id
                    AND k2.indicator_id = c.indicator_id))
         AND NOT EXISTS (
                 SELECT 1 FROM counted_reports k3
                  WHERE k3.org_unit_id  = c.org_unit_id
                    AND k3.template_id  = c.template_id
                    AND k3.period_id    = mp.id)
  ) m;
"""


def upgrade() -> None:
    op.execute(VIEW)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_report_value_computed")

"""fix v_report_value_computed: báo cáo mới (0 report_value) vẫn tính lũy kế

task-11-carry.md C1. CTE `ctx` của migration 0002 bắt đầu bằng
`FROM report_value rv JOIN indicator i ... JOIN report r ...`, nên báo cáo
chưa có dòng `report_value` nào (vừa "Tạo báo cáo") không sinh dòng nào cho
48 chỉ tiêu `sum` trong view, và LEFT JOIN ở `lay_chi_tiet_bao_cao` ra
`acc_prev_computed = NULL` dù kỳ trước đã duyệt có số thật — đúng thứ form
này sinh ra để tránh (probe controller: P05 kỳ 2026-09).

Sửa: `ctx` bắt đầu từ `report` × `indicator` (lọc theo `template_id` của báo
cáo và `agg_type = 'sum'`) rồi LEFT JOIN `report_value`, thay vì bắt đầu từ
`report_value`. Vì `rv` giờ có thể NULL, mọi chỗ trong LATERAL số dư trước đó
đọc `rv.indicator_id` phải đổi sang `i.id` (không đổi gì khác — outer SELECT,
CTE `counted`/`counted_reports`, hai CROSS JOIN LATERAL phía dưới giữ nguyên
100% vì đã COALESCE `c.this_period` sẵn từ 0002).

DROP VIEW + CREATE VIEW bản mới, không sửa 0002_view.py tại chỗ (CONTEXT.md).
"""
from alembic import op

revision = "0003"
down_revision = "0002"

VIEW_CU = """
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

VIEW_MOI = """
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
    SELECT r.id AS report_id, i.id AS indicator_id, rv.this_period,
           r.org_unit_id, r.template_id, p.start_date,
           o.ob_start, o.ob_value
      FROM report r
      JOIN reporting_period p ON p.id = r.period_id
      JOIN indicator i        ON i.template_id = r.template_id AND i.agg_type = 'sum'
      LEFT JOIN report_value rv ON rv.report_id = r.id AND rv.indicator_id = i.id
      LEFT JOIN LATERAL (
          SELECT op.start_date AS ob_start, o2.value AS ob_value
            FROM opening_balance o2
            JOIN reporting_period op ON op.id = o2.period_id
           WHERE o2.org_unit_id  = r.org_unit_id
             AND o2.indicator_id = i.id
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
    op.execute("DROP VIEW v_report_value_computed")
    op.execute(VIEW_MOI)


def downgrade() -> None:
    op.execute("DROP VIEW v_report_value_computed")
    op.execute(VIEW_CU)

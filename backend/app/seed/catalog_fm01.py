# backend/app/seed/catalog_fm01.py
"""Danh mục chỉ tiêu FM01, trích một lần từ app/seed/source/FM01.xlsx.

Nguồn: sheet đầu tiên "Monthly HSE REPORT" (xl/worksheets/sheet1.xml), đọc
bằng zipfile + xml.etree chuẩn (không phụ thuộc openpyxl — xem
.superpowers/sdd/2026-09-09-hseq-mvp-fm01/task-6-brief.md Step 3 cho lệnh
trích). Sau bước này, module không còn phụ thuộc file Excel hay openpyxl.

Vùng chỉ tiêu là các dòng giữa dòng 11 (header cột) và dòng 77 (tiêu đề mục
C). Dòng có cột B bắt đầu bằng "B-<số>:" là tiêu đề nhóm (đổi section, reset
số thứ tự); dòng bắt đầu bằng "B-<số>-<số>:" là tiêu đề nhóm con (chỉ đánh
dấu, KHÔNG đổi section, KHÔNG reset số thứ tự — nếu reset thì "B-2.1" bị lặp
lại ở cả 3 nhóm con của B-2 và vi phạm UNIQUE(template_id, code)). Mọi dòng
còn lại có cột B không rỗng là một chỉ tiêu, kể cả dòng "Khác (Other)" —
những dòng này không có cột C nên `unit = None`.

Tên chỉ tiêu (cột B) ngăn cách tiếng Việt / tiếng Anh bằng xuống dòng (phổ
biến nhất) hoặc bằng dấu ngoặc đơn cuối chuỗi khi viết trên một dòng; tách
đúng theo cách cột đó dùng, giữ nguyên văn — không viết lại chính tả, không
gõ lại dấu câu. Cột C dạng "Giờ/hour", "Số vụ/ case": lấy phần trước dấu "/"
làm `unit` (phần tiếng Việt).

Hai điểm gốc-file cần biết khi review (giữ nguyên, không "sửa lỗi" của file
nguồn — trích nguyên văn):
- B-6.2: tên tiếng Việt trong file có dấu ")" thừa không khớp ("…)") — lỗi
  gõ trong FM01.xlsx, giữ nguyên.
- B-8.2 và B-8.3 cùng chung tên tiếng Anh "Industrial waste treatment"
  trong file gốc (B-8.3 nói về chất thải xây dựng) — có thể là lỗi copy-paste
  của người viết mẫu gốc, giữ nguyên vì đó là chữ trong file.

Phân loại `agg_type` (đối chiếu bảng spec docs/designs/hseq-platform-mvp-fm01.md
dòng 183-188): mặc định `sum`. Duy nhất nhóm B-1 có ngoại lệ — 3 dòng giờ đầu
(TCT, Đơn vị, Nhà thầu phụ) là `sum`; "Tổng giờ công" là `computed` (cộng 3
dòng đó); 4 dòng còn lại của B-1 là bộ đếm reset theo sự kiện, không cộng dồn
được (`counter`): "Giờ an toàn kể từ LTI cuối" và "ngày làm việc an toàn
không LTI" reset theo sự kiện LTI (`on_event:LTI`), "luỹ kế giờ an toàn từ
đầu năm" reset theo năm (`yearly`), "ngày làm việc từ khi bắt đầu dự án"
reset theo dự án (`project_start`). `required = True` cho mọi dòng trừ dòng
`computed` (spec: "computed không bao giờ bắt buộc" — bắt buộc một dòng
không ai nhập được là vô nghĩa).

`decimals` (spec dòng 140, brief mục 5): 2 cho đơn vị "Giờ" và "kg", 0 cho
mọi đơn vị còn lại (số vụ / lượt / lần / ngày / người / cái) kể cả dòng
"Khác" (không có `unit`).

Mã `code` = "<section>.<số thứ tự trong section>", đánh số phẳng xuyên suốt
mọi nhóm con (vd B-2 gồm 3 nhóm con B-2-1/2-2/2-3 nhưng đánh số liên tục
B-2.1 … B-2.18) — section trong bảng `template_section` chỉ có A, B-1…B-9, C
(spec dòng 139), không có cấp nhóm con.
"""

# (code, name_vi, name_en, sort_order)
SECTIONS = [
    ("A",   "THÔNG TIN CHUNG",                                    "General Information",                 1),
    ("B-1", "TỔNG GIỜ CÔNG",                                      "Total Man Hours",                     2),
    ("B-2", "Tai nạn/ Sự cố",                                     "Accident / Incident",                 3),
    ("B-3", "Hướng dẫn, đào tạo, huấn luyện SKATMT",               "HSE Training/Presentation/Induction", 4),
    ("B-4", "Thực tập - Diễn tập",                                "HSE Exercise/Drill",                  5),
    ("B-5", "Họp an toàn",                                        "HSE Meeting/Talk",                    6),
    ("B-6", "Kiểm tra/ đánh giá SKATMT",                           "HSE Audit/Inspection/Visit",          7),
    ("B-7", "Báo cáo công tác an toàn tới Cơ quan chức năng",      "HSE Report to Authority",             8),
    ("B-8", "Quản lý môi trường",                                 "Environmental Management",            9),
    ("B-9", "Hoạt động SKATMT khác",                              "Other HSE Activity",                  10),
    ("C",   "CÁC HOẠT ĐỘNG NỔI BẬT",                               "Outstanding HSE activities",          11),
]

# (section_code, code, name_vi, name_en, unit, agg_type, formula, reset_rule, decimals, required)
INDICATORS = [
    ('B-1', 'B-1.1', 'TCT PTSC', 'PTSC Corp.', 'Giờ', 'sum', None, 'none', 2, True),
    ('B-1', 'B-1.2', 'Đơn vị thuộc PTSC', 'PTSC Subsidiary', 'Giờ', 'sum', None, 'none', 2, True),
    ('B-1', 'B-1.3', 'Nhà thầu phụ', 'Sub-contractors', 'Giờ', 'sum', None, 'none', 2, True),
    ('B-1', 'B-1.4', 'Tổng giờ công', 'Total Man Hours', 'Giờ', 'computed', 'B-1.1,B-1.2,B-1.3', 'none', 2, False),
    ('B-1', 'B-1.5', 'Tổng giờ công an toàn không xảy ra LTI', 'Tmhr since last LTI', 'Giờ', 'counter', None, 'on_event:LTI', 2, True),
    ('B-1', 'B-1.6', 'Lũy kế giờ an toàn từ đầu năm nay', 'Accumulated year-to-date', 'Giờ', 'counter', None, 'yearly', 2, True),
    ('B-1', 'B-1.7', 'Tổng số ngày làm việc an toàn không xảy ra LTI', 'Total working day non LTI', 'Ngày', 'counter', None, 'on_event:LTI', 0, True),
    ('B-1', 'B-1.8', 'Tổng số ngày làm việc kể từ khi bắt đầu dự án', 'Total number of working days from the project start date', 'Ngày', 'counter', None, 'project_start', 0, True),
    ('B-2', 'B-2.1', 'Chết người', 'FAT (Fatality)', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.2', 'Thương tật mất thời gian', 'LTI (Lost Time Injury)', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.3', 'Số ngày công bị mất', 'Number of lost work days', 'Ngày', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.4', 'Thương tật hạn chế công việc', 'RWDC (Restricted Work Day Case)', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.5', 'Số ngày công hạn chế công việc', 'Number of restricted work days', 'Ngày', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.6', 'Thương tật điều trị y tế', 'MTC (Medical Treatment Case)', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.7', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.8', 'Sơ cứu', 'FAC (First Aid Case)', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.9', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.10', 'Báo cáo cận nguy hiểm', 'Near Miss', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.11', 'Báo cáo hành động/ điều kiện làm việc không an toàn', 'UA/UC report - HAZOB CARD', 'Cái', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.12', 'Sự cố cháy nổ', 'Fire/Explosion', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.13', 'Sự cố tràn dầu', 'Oil spill', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.14', 'Sự cố thiệt hại tài sản, thiết bị', 'Property Lost/Damaged', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.15', 'Sự cố tràn đổ/ rò rỉ hóa chất', 'Chemical spill/ leaking', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.16', 'Sự cố môi trường', 'Environmental incident', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.17', 'Tai nạn giao thông đường bộ', 'Road Incident', 'Số vụ', 'sum', None, 'none', 0, True),
    ('B-2', 'B-2.18', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
    ('B-3', 'B-3.1', 'Huấn luyện ATVSLĐ theo quy định', 'Mandatory HSE Training', 'Số lượt người', 'sum', None, 'none', 0, True),
    ('B-3', 'B-3.2', 'Hướng dẫn an toàn trước khi làm việc', 'HSE Induction/Briefing/Orientation', 'Số lượt người', 'sum', None, 'none', 0, True),
    ('B-3', 'B-3.3', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
    ('B-4', 'B-4.1', 'Tổng số lượt diễn tập/thực tập', 'HSE exercise/ Drill', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-4', 'B-4.2', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
    ('B-5', 'B-5.1', 'Họp bộ phận an toàn', 'HSE Committee/Team Meeting', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-5', 'B-5.2', 'Họp an toàn đầu tuần', 'Weekly Toolbox Meeting', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-5', 'B-5.3', 'Họp an toàn đầu ca', 'Daily Toolbox Meeting', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-5', 'B-5.4', 'Họp phân tích an toàn công việc', 'JSA Meeting', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-5', 'B-5.5', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
    ('B-6', 'B-6.1', 'Kiểm tra hiện trường cấp lãnh đạo', 'Top management HSE visits/ site tours', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-6', 'B-6.2', 'Số lượt Kiểm tra máy móc/ thiết bị/ thiết bị PCCC/ Thiết bị điện…)', 'Number of Equipment/Machineries, firefighting, electrical... inspection', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-6', 'B-6.3', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
    ('B-7', 'B-7.1', 'Báo cáo về công tác y tế', 'Periodic medical reports', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-7', 'B-7.2', 'Báo cáo về công tác ATVSLĐ', 'Periodic reports on OHS', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-7', 'B-7.3', 'Khai báo sử dụng đối tượng kiểm định (trang thiết bị có yêu cầu nghiêm ngặt về an toàn lao động)', 'Report on the use of the inspected object (equipment with strict safety requirements)', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-7', 'B-7.4', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
    ('B-8', 'B-8.1', 'Chất thải rắn sinh hoạt chuyển đi xử lý', 'Domestic waste treatment', 'kg', 'sum', None, 'none', 2, True),
    ('B-8', 'B-8.2', 'Chất thải rắn công nghiệp chuyển đi xử lý', 'Industrial waste treatment', 'kg', 'sum', None, 'none', 2, True),
    ('B-8', 'B-8.3', 'Chất thải xây dựng chuyển đi xử lý', 'Industrial waste treatment', 'kg', 'sum', None, 'none', 2, True),
    ('B-8', 'B-8.4', 'Chất thải nguy hại chuyển đi xử lý', 'Solid waste treatment', 'kg', 'sum', None, 'none', 2, True),
    ('B-8', 'B-8.5', 'Quan trắc môi trường', 'Environment monitoring', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-8', 'B-8.6', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
    ('B-9', 'B-9.1', 'Phát thưởng an toàn', 'Safety incentive/ awarding program', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-9', 'B-9.2', 'Phát động chiến dịch SKATMT', 'HSE Campaign/Promotion', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-9', 'B-9.3', 'Lễ kỷ niệm/chào mừng đạt cột mốc an toàn', 'HSE Milestone Ceremony', 'Số lần', 'sum', None, 'none', 0, True),
    ('B-9', 'B-9.4', 'Khác', 'Other', None, 'sum', None, 'none', 0, True),
]

# (code, label_vi, sort_order)
TEXT_FIELDS = [
    ("C1", "Hoạt động nổi bật trong tháng", 1),
    ("C2", "Hoạt động dự kiến cho tháng tới", 2),
    ("C3", "Kiến nghị/ Đề xuất", 3),
]

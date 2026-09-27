# An toàn nhập liệu

Trang này giải thích các lớp giữ cho số đã gõ không mất, không bị ghi đè âm thầm, và không lọt số sai vào báo cáo đã nộp.

## Bài toán

Một báo cáo FM01 có 53 dòng chỉ tiêu và ba ô chữ. Người nhập gõ trong nhiều phút, có khi mạng chập chờn, có khi cùng một báo cáo đang mở ở hai nơi (hai tab, hoặc người nhập và Ban ATCL). Ba điều không được xảy ra:

1. Số đã gõ biến mất.
2. Hai người sửa cùng lúc, người sau ghi đè người trước mà không ai biết.
3. Báo cáo được nộp với số sai định dạng hoặc thiếu ô bắt buộc.

## Các lớp

```
 Trình duyệt                              Server
 ───────────                              ──────
 1. đọc số kiểu vi-VN, báo lỗi tại ô
 2. hàng chờ ô đã đổi, lưu theo lượt  ──► 4. một transaction cho mỗi request
 3. giữ trang khi còn ô chưa lưu          5. khoá dòng báo cáo, so version
                                          6. làm tròn, kiểm luật số
                                          7. cổng nộp: đủ ô bắt buộc
                                          8. nhật ký cùng transaction
```

### 1. Đọc số tại ô

`parseViNumber` đọc số theo quy ước Việt Nam: dấu phẩy thập phân, dấu chấm ngăn nghìn. Dấu chấm chỉ được chấp nhận khi đúng nhóm ba chữ số. `1284500.00` (kiểu Excel tiếng Anh) bị báo `Chỉ nhập số` thay vì bị hiểu thành 128.450.000.

Luật số chữ số thập phân, số âm, giới hạn 16 chữ số phần nguyên dùng lại đúng câu báo của backend. Người nhập thấy lỗi ngay tại ô, trước khi có request nào.

### 2. Lưu theo lượt, không theo đồng hồ

Form không tự lưu mỗi N giây. Rời một ô có sửa thì hẹn lưu sau 1,5 giây; mọi ô đổi trong khoảng đó đi chung một `PUT`. Nút "Lưu" và Ctrl+S lưu ngay.

Lựa chọn này làm mỗi lượt lưu là một thao tác có nghĩa (một `version`), thay vì một chuỗi lượt ghi nửa chừng khi người dùng đang gõ dở một số.

Payload chỉ chứa ô đã đổi. Server hiểu: mã chỉ tiêu vắng mặt thì giữ nguyên, trường vắng mặt thì giữ nguyên, trường gửi `null` thì xoá. Nhờ vậy sửa một con số không xoá mất ghi chú của dòng đó.

Lượt lưu hỏng vì mạng không làm mất ô: ô vẫn nằm trong hàng chờ, form hiện banner mất mạng và tự gửi lại khi trình duyệt báo có mạng trở lại.

### 3. Giữ trang

Còn ô chưa lưu thì chuyển trang trong ứng dụng hay đóng tab đều bị hỏi lại. Bấm "Nộp" thì form lưu trước; lưu hỏng thì không nộp.

### 4. Một transaction cho mỗi request

`get_db` commit khi request xong và rollback khi có bất kỳ lỗi nào, kể cả lỗi nghiệp vụ 400 hay 409. Không có lượt ghi nào dừng giữa chừng để lại nửa báo cáo.

### 5. Khoá lạc quan bằng `version`

Mỗi báo cáo có `version`, tăng 1 sau mỗi lượt ghi số hoặc chuyển trạng thái thành công. Mọi lệnh ghi phải gửi `version` mà client đang giữ:

```
Người A mở báo cáo (version 4)          Người B mở báo cáo (version 4)
A lưu với version 4 → OK, version 5
                                        B lưu với version 4 → 409
                                        thân lỗi mang version 5 và số hiện tại
                                        form của B vá cột chỉ đọc, giữ số B đang gõ,
                                        hiện banner "người khác vừa sửa"
```

Server khoá dòng báo cáo (`SELECT ... FOR UPDATE`) trước khi so `version`, nên hai request đến cùng lúc không thể cùng thấy version cũ. Lần đọc có khoá dùng `populate_existing()` để không đọc nhầm bản cũ SQLAlchemy đã giữ trong session từ bước kiểm quyền. Test `backend/tests/test_khoa_lac_quan_tuong_tranh.py` dùng hai session thật để khoá hành vi này.

Chuyển trạng thái so thêm trạng thái đang thấy (`expected_state`). Hai người cùng bấm "Duyệt" và "Trả lại" thì một người nhận 409.

Form giữ số đang gõ tách khỏi cache của TanStack Query. 409 chỉ vá cột chỉ đọc và `version`, không ghi đè cả form, nên thứ người dùng đang gõ không mất.

### 6. Làm tròn rồi kiểm

Server làm tròn số về đúng `decimals` của chỉ tiêu (làm tròn nửa lên) rồi mới kiểm. `12,345` gửi vào chỉ tiêu 2 chữ số thập phân được lưu thành `12,35`. Form đã chặn trường hợp này từ trước, nên làm tròn ở server chỉ để dữ liệu lưu luôn đúng hình dạng.

Luật kiểm nằm ở `backend/app/domain/report_rules.py`: mã chỉ tiêu phải có trong mẫu, dòng tự tính không nhận số, không âm, không quá 16 chữ số phần nguyên, đúng cột nhập được theo `agg_type`. Lỗi trả 400 kèm danh sách `{indicator_code, message}` để form tô đúng ô. Khoá lạ trong JSON bị từ chối 422, vì đó là lỗi của mã gọi API, không phải của người nhập.

### 7. Cổng nộp

Nộp kiểm mọi ô bắt buộc của cả báo cáo, không chỉ các ô vừa gửi. Ô chưa từng có dòng dữ liệu cũng bị bắt. Form chặn trước ở phía trình duyệt, server chặn lần nữa.

Sau khi nộp, trạng thái không còn `is_editable` nên mọi lượt ghi số bị từ chối 403. Muốn sửa phải qua "Trả lại" hoặc "Mở lại", cả hai đều bắt ghi lý do, và lý do hiện ở đầu form cho người nhập.

### 8. Nhật ký cùng transaction

Mỗi lần chuyển trạng thái ghi một dòng `audit_log` với ảnh chụp trước và sau, trong cùng transaction với thay đổi. Không có thay đổi nào thiếu dòng nhật ký, và không có dòng nhật ký nào mô tả thay đổi đã bị huỷ.

## Cái giá

- **Lỗi chưa sửa: form không nhận số từ lượt tải nền.** Form lấy số một lần lúc trang mở, từ cache của tab nếu báo cáo đã được xem trong vòng 5 phút trước đó. Lượt tải nền sau đó đổi trạng thái và nút theo server, nhưng không đổi các ô số. Trang để mở sẵn từ trước cũng vậy. Người duyệt mở lại một báo cáo vừa được nộp lại có thể thấy số cũ kèm nút "Duyệt". Lần bấm đầu nhận 409 vì gửi `version` cũ. 409 đưa `version` mới vào form nhưng không đưa số mới, nên lần bấm thứ hai qua được và duyệt những con số người duyệt chưa thấy. Tải lại trang trước khi duyệt thì tránh được. Chỗ gây lỗi: `useReducer(rutGon, chiTiet, khoiTao)` trong `frontend/src/features/report/ReportForm.tsx` chỉ chạy `khoiTao` một lần, và `ReportDetail.tsx` không đặt `key` để dựng lại form khi dữ liệu mới về.
- **Hai bản luật cột nhập được.** `frontend/src/features/report/cellPolicy.ts` chép bảng `agg_type` của `report_rules.py` để form phản hồi ngay tại ô. Không có test nào so hai bản với nhau; chú thích ở cả hai file nhắc sửa bên này phải sửa bên kia. Server vẫn là bên quyết định cuối, nên lệch nhau chỉ làm form báo sai, không làm lưu sai.
- **409 không tự gộp.** Người nhận 409 phải xem lại số của người kia. Với một đầu mối một báo cáo mỗi kỳ, xung đột thật hiếm, và gộp tự động hai bản số HSSEQ là thứ không nên đoán.
- **Ô đang gõ dở chưa rời ô thì chưa vào hàng chờ.** Trình duyệt sập giữa lúc gõ thì mất đúng ô đó.
- **Hết phiên giữa chừng.** Token hết hạn sau 12 giờ; lượt lưu kế tiếp nhận 401 và trang chuyển về đăng nhập, ô chưa kịp lưu lúc đó không được giữ lại.
- **Không nhật ký cho từng lượt ghi số.** `PUT values` chỉ tăng `version`, không ghi `audit_log`. Lịch sử cho biết ai nộp, ai duyệt, ai trả lại, nhưng không cho biết ô nào đổi từ số nào sang số nào giữa hai lần nộp.

## Lựa chọn khác

- **Tự lưu theo đồng hồ.** Dễ làm, nhưng ghi những số đang gõ dở và tạo nhiều `version` vô nghĩa, làm 409 xảy ra thường hơn.
- **Khoá bi quan (ai mở trước giữ báo cáo).** Chặn xung đột hoàn toàn, nhưng một tab bỏ quên giữ khoá cả ngày, và cần thêm cơ chế nhả khoá.
- **Chỉ kiểm ở server.** Một nguồn luật duy nhất, nhưng người nhập chỉ biết sai sau khi rời ô và chờ mạng, chậm hẳn khi mạng yếu.

## Xem thêm

- [API](../reference/api.md): thứ tự kiểm lỗi của `PUT values` và `transition`.
- [Frontend](../reference/frontend.md#cách-lưu): chi tiết lớp lưu và phím tắt.
- [Lũy kế](luy-ke.md): số nào hệ thống tự tính và số nào người nhập chịu trách nhiệm.
- [Kiến trúc](kien-truc.md): đường đi của một lượt ghi số qua các lớp.

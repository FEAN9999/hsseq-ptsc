// frontend/src/features/report/GroupHeader.tsx
//
// Hàng tiêu đề nhóm của bảng FM01 — là một HÀNG trong bảng, KHÔNG phải một cái hộp/card bao quanh
// nhóm (bản vẽ approve.html: `tr.grp td`, và D5 của design review liệt "thẻ xếp chồng thay bố cục
// ở form" vào ba hard rejection).
//
// Dính DƯỚI header cột: `top-9` = 36px = đúng chiều cao một dòng `<th>` (tokens.css `th{height:36px}`).
// Đổi chiều cao dòng mà quên đổi con số này thì hai lớp dính chồng lên nhau.
//
// `name_en` 11px chỉ xuất hiện Ở ĐÂY (D26: "name_vi là nhãn chính, name_en chỉ ở header nhóm và
// title khi hover dòng") — không lặp lại tiếng Anh ở từng dòng chỉ tiêu.
//
// `id` là đích của mục lục bên phải; `scroll-mt-20` (80px) đúng `scroll-margin-top: 80px` của
// thiết kế, để hàng không nấp dưới header cột dính khi nhảy tới bằng `#anchor`.

export interface NhomMau {
  code: string
  name_vi: string
  name_en: string
}

export function GroupHeader({ nhom, soCot }: { nhom: NhomMau; soCot: number }) {
  return (
    <tr id={nhom.code} className="scroll-mt-20">
      <td
        colSpan={soCot}
        className="sticky top-9 z-10 h-8 px-3 bg-muted border-b border-border text-[13.5px] font-semibold text-secondary-foreground"
      >
        {nhom.code}. {nhom.name_vi}
        <small className="ml-2 font-normal text-[11px] text-sec">{nhom.name_en}</small>
      </td>
    </tr>
  )
}

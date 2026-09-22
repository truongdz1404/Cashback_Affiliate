// Answers shared by /guide and /support. Everything here describes how the
// backend actually behaves (server.js, lib/walletBalance.js) - keep it that
// way rather than promising timelines the reconciliation job cannot meet.
export type Faq = { question: string; answer: string };

export const FAQ_GROUPS: { title: string; items: Faq[] }[] = [
  {
    title: "Hoàn tiền & đơn hàng",
    items: [
      {
        question: "Làm thế nào để biết đơn hàng đã lên?",
        answer:
          "Đơn hàng thường xuất hiện trong mục Tiền hoàn của tôi sau khi Shopee xác nhận giao dịch hợp lệ qua link hoàn tiền của bạn. Khi đơn mới lên, trạng thái là “Chờ xác nhận”.",
      },
      {
        question: "Khi nào tiền hoàn được cộng vào số dư khả dụng?",
        answer:
          "Sau khi Shopee đối soát và đơn chuyển sang “Hoàn thành”, tiền hoàn được cộng vào số dư khả dụng và bạn có thể tạo yêu cầu rút tiền.",
      },
      {
        question: "Vì sao tôi phải mở Shopee qua Rewally thay vì mở trực tiếp?",
        answer:
          "Rewally tạo một liên kết riêng gắn mã theo dõi của bạn. Nếu bạn mở Shopee bằng đường khác, đơn hàng sẽ không được ghi nhận và không có tiền hoàn.",
      },
      {
        question: "Đơn bị huỷ hoặc trả hàng thì sao?",
        answer:
          "Đơn huỷ hoặc hoàn trả sẽ không được Shopee tính hoa hồng, nên tiền hoàn dự kiến của đơn đó cũng bị gỡ khỏi ví.",
      },
    ],
  },
  {
    title: "Tạo link hoàn tiền",
    items: [
      {
        question: "Tôi có thể tạo link ở sàn nào?",
        answer:
          "Hiện tại Rewally hỗ trợ mọi link sản phẩm shopee.vn và link rút gọn shp.ee. Lazada, TikTok Shop và Tiki sẽ được mở dần trong các bản cập nhật tới.",
      },
      {
        question: "Link hoàn tiền dùng được bao lâu?",
        answer:
          "Link không hết hạn, nhưng mỗi lần mua bạn nên tạo hoặc mở lại link từ Rewally để chắc chắn đơn được gắn đúng mã theo dõi của mình.",
      },
    ],
  },
  {
    title: "Rút tiền",
    items: [
      {
        question: "Tôi rút tiền về đâu?",
        answer:
          "Tiền được chuyển khoản về tài khoản ngân hàng bạn khai báo trong mục Tài khoản ngân hàng. Hãy kiểm tra kỹ số tài khoản và tên chủ tài khoản trước khi tạo yêu cầu.",
      },
      {
        question: "Vì sao tôi không tạo được yêu cầu rút tiền?",
        answer:
          "Mỗi lần chỉ có một yêu cầu đang chờ duyệt, số tiền phải đạt mức tối thiểu hiển thị trên trang Rút tiền và không vượt quá số dư khả dụng. Bạn cũng cần thiết lập tài khoản ngân hàng trước.",
      },
      {
        question: "Bao lâu thì nhận được tiền?",
        answer:
          "Yêu cầu được đội ngũ Rewally kiểm tra và chuyển khoản thủ công. Bạn theo dõi trạng thái (Đang chờ duyệt, Đã duyệt, Đã thanh toán) ngay trong lịch sử rút tiền.",
      },
    ],
  },
  {
    title: "Tài khoản",
    items: [
      {
        question: "Tôi có thể đổi số điện thoại không?",
        answer:
          "Số điện thoại là tài khoản đăng nhập nên chưa tự đổi được trên web. Bạn có thể thêm hoặc đổi email (xác thực bằng mã OTP) và tạo mật khẩu trong mục Thông tin tài khoản.",
      },
      {
        question: "Tôi đăng nhập bằng Google/Facebook, có cần mật khẩu không?",
        answer:
          "Không bắt buộc. Nếu muốn đăng nhập thêm bằng số điện thoại hoặc email, hãy vào Cập nhật mật khẩu để tạo mật khẩu cho tài khoản.",
      },
      {
        question: "Mã giới thiệu hoạt động thế nào?",
        answer:
          "Bạn bè đăng ký bằng mã của bạn, sau đó mỗi đơn hoàn thành của họ đều mang về cho bạn một phần trăm số tiền hoàn của đơn đó (tỷ lệ hiện tại xem trong mục Giới thiệu bạn bè). Khoản này được cộng vào số dư khả dụng của bạn và không làm giảm hoàn tiền của người bạn mời.",
      },
    ],
  },
];

export const FAQS: Faq[] = FAQ_GROUPS.flatMap((group) => group.items);

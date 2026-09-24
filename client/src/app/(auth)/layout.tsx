import Image from "next/image";
import Link from "next/link";
import { BoltIcon, ShieldIcon, WalletIcon } from "@/components/icons";

const POINTS = [
  { icon: WalletIcon, text: "Hoàn tiền thật vào ví, rút về tài khoản ngân hàng" },
  { icon: BoltIcon, text: "Không cần mã giảm giá, chỉ cần bấm mua qua Rewally" },
  { icon: ShieldIcon, text: "Theo dõi từng đơn hàng và số tiền hoàn dự kiến" },
];

// The auth pages deliberately skip the site header: nothing on them should
// pull a visitor away mid-sign-in except the logo (back to home).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-[var(--background)] lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--accent)] p-12 text-[var(--accent-foreground)] lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="Rewally" width={40} height={40} className="rounded-xl" />
          <span className="text-xl font-extrabold tracking-tight">Rewally</span>
        </Link>

        <div>
          <h2 className="max-w-md text-3xl font-extrabold leading-tight">
            Mua sắm như thường lệ, nhận lại tiền mặt sau mỗi đơn hàng
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="max-w-sm text-sm leading-relaxed opacity-95">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <Image
          src="/mascot.png"
          alt=""
          width={180}
          height={180}
          className="absolute -bottom-6 -right-6 opacity-90 drop-shadow-2xl"
        />
        <p className="relative text-xs opacity-80">© {new Date().getFullYear()} Rewally</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <Image src="/logo.png" alt="Rewally" width={36} height={36} className="rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight text-[var(--foreground)]">Rewally</span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}

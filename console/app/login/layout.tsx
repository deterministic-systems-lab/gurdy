import Image from "next/image";

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return (
    <div className="login-stage">
      <div aria-hidden className="login-factory">
        <Image
          src="/gurdy-factory-bg.png"
          alt=""
          fill
          preload
          sizes="100vw"
          className="login-factory-img"
        />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

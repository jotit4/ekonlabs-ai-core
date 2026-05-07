export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <main id="main-content">{children}</main>
}

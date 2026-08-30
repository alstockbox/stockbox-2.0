export function StockBoxMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" role="img" aria-label="StockBox">
      <rect x="2" y="2" width="36" height="36" rx="9" fill="#10243a" stroke="#e1cb95" strokeWidth="1.5" />
      <path d="M10 28V20h5v8h-5Zm7.5 0V14h5v14h-5ZM25 28V9h5v19h-5Z" fill="#e1cb95" />
      <path d="M9.5 11.5 15 8l5.5 3.5L26 8l4.5 2.5" fill="none" stroke="#f4efe5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

import Link from 'next/link';

export default function MemberPage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px', margin: '4rem auto', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111', marginBottom: '0.75rem' }}>
        Member Dashboard
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
        Coming soon — Phase 10B will build this page.
      </p>
      <Link
        href="/insights"
        style={{
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#111',
          textDecoration: 'underline',
        }}
      >
        ← Back to Insights
      </Link>
    </main>
  );
}

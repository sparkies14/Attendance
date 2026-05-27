'use client';

interface AttentionMember {
  name: string;
  email: string;
  reasons: string[];
}

interface Props {
  members: AttentionMember[];
  emptyMessage: string;
}

export default function AttentionWidget({ members, emptyMessage }: Props) {
  if (members.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
      {members.map(m => (
        <div
          key={m.email}
          style={{
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            padding: '1rem',
            background: '#fff7ed',
            minWidth: '200px',
          }}
        >
          <strong>{m.name}</strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            {m.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

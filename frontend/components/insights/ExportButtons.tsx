'use client';

import type { CSSProperties } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const btnStyle: CSSProperties = {
  fontSize: '0.75rem',
  padding: '0.25rem 0.5rem',
  background: '#e5e7eb',
  color: '#374151',
  border: '1px solid #9ca3af',
  borderRadius: '4px',
  textDecoration: 'none',
  cursor: 'pointer',
  display: 'inline-block',
};

interface Props {
  section: 'tardy' | 'leave' | 'discipline';
  from: string;
  to: string;
  csvLabel: string;
  pdfLabel: string;
}

export default function ExportButtons({ section, from, to, csvLabel, pdfLabel }: Props) {
  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem' }}>
      <a
        href={`${API_URL}/reports/export/${section}.csv?from=${from}&to=${to}`}
        target="_blank"
        rel="noopener noreferrer"
        style={btnStyle}
      >
        {csvLabel}
      </a>
      <a
        href={`${API_URL}/reports/export/${section}.pdf?from=${from}&to=${to}`}
        target="_blank"
        rel="noopener noreferrer"
        style={btnStyle}
      >
        {pdfLabel}
      </a>
    </span>
  );
}

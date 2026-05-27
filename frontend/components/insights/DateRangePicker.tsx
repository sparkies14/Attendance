'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  initialFrom: string;
  initialTo: string;
  labelFrom: string;
  labelTo: string;
  labelApply: string;
  errorMessage: string;
}

export default function DateRangePicker({
  initialFrom,
  initialTo,
  labelFrom,
  labelTo,
  labelApply,
  errorMessage,
}: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [hasError, setHasError] = useState(false);

  function handleApply() {
    if (from > to) {
      setHasError(true);
      return;
    }
    setHasError(false);
    router.push(`/insights?from=${from}&to=${to}`);
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <label style={{ marginRight: '0.5rem' }}>
        {labelFrom}{' '}
        <input
          type="date"
          value={from}
          onChange={e => setFrom(e.target.value)}
          style={{ marginRight: '1rem' }}
        />
      </label>
      <label style={{ marginRight: '0.5rem' }}>
        {labelTo}{' '}
        <input
          type="date"
          value={to}
          onChange={e => setTo(e.target.value)}
          style={{ marginRight: '1rem' }}
        />
      </label>
      <button onClick={handleApply}>{labelApply}</button>
      {hasError && (
        <span style={{ color: 'red', marginLeft: '1rem', fontSize: '0.875rem' }}>
          {errorMessage}
        </span>
      )}
    </div>
  );
}

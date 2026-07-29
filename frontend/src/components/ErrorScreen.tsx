import { useRouteError } from 'react-router-dom'

/**
 * Last line of defence. A farmer standing in an orchard cannot open a console,
 * so a crash has to show something they can act on — and something they can
 * screenshot and send. Deliberately plain, with no dependency on i18n or the
 * stores, because those are exactly what might have failed.
 */
export default function ErrorScreen() {
  const error = useRouteError()
  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : JSON.stringify(error)?.slice(0, 300)

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '32px 24px',
        gap: 16,
        fontFamily: 'IBM Plex Sans Thai, Inter, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>เกิดข้อผิดพลาด</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: '#6B7280' }}>
        แอปทำงานผิดพลาด ลองกดปุ่มด้านล่างเพื่อเริ่มใหม่ ข้อมูลการวัดที่บันทึกไว้ยังอยู่ครบ
      </p>
      <pre
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          lineHeight: 1.5,
          background: '#F4F4F2',
          color: '#0F1512',
          padding: 12,
          borderRadius: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 180,
          overflow: 'auto',
        }}
      >
        {detail}
      </pre>
      <button
        onClick={() => {
          window.location.href = '/home'
        }}
        style={{
          minHeight: 52,
          borderRadius: 16,
          border: 0,
          background: '#16A34A',
          color: '#fff',
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        กลับหน้าแรก
      </button>
    </div>
  )
}

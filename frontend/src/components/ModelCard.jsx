import { UnstyledButton, Text, Stack } from '@mantine/core'

export default function ModelCard({ model, active, onClick }) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        padding: '10px 8px',
        borderRadius: 8,
        border: `1px solid ${active ? 'rgba(10,132,255,0.45)' : 'var(--panel-border)'}`,
        background: active ? 'rgba(10,132,255,0.12)' : 'rgba(255,255,255,0.04)',
        textAlign: 'center',
        transition: 'all 0.18s',
        width: '100%',
        cursor: 'pointer',
      }}
    >
      <Stack gap={3} align="center">
        <Text size="xs" fw={600} c={active ? 'blue' : 'gray.3'} style={{ lineHeight: 1.2 }}>
          {model.name}
        </Text>
        <Text size="10px" c="dimmed" style={{ lineHeight: 1.3 }} lineClamp={2}>
          {model.desc}
        </Text>
      </Stack>
    </UnstyledButton>
  )
}

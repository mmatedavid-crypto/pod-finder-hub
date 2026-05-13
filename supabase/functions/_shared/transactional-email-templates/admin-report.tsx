import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Podiverzum'

interface AdminReportProps {
  title?: string
  intro?: string
  rows?: Array<{ label: string; value: string }>
  notes?: string
}

const AdminReport = ({ title, intro, rows, notes }: AdminReportProps) => (
  <Html lang="hu" dir="ltr">
    <Head />
    <Preview>{title || `${SITE_NAME} admin riport`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{title || 'Admin riport'}</Heading>
        {intro ? <Text style={text}>{intro}</Text> : null}
        {rows && rows.length ? (
          <Section style={card}>
            {rows.map((r, i) => (
              <Text key={i} style={row}>
                <span style={label}>{r.label}</span>
                <span style={value}>{r.value}</span>
              </Text>
            ))}
          </Section>
        ) : null}
        {notes ? <Text style={small}>{notes}</Text> : null}
        <Text style={footer}>— {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminReport,
  subject: (d: Record<string, any>) => d?.title || 'Podiverzum admin riport',
  displayName: 'Admin report',
  previewData: {
    title: 'Entity extraction report',
    intro: '40 új névhez sorbaállítottuk az epizódokat.',
    rows: [
      { label: 'Új nevek', value: '40' },
      { label: 'Sorbaállítva', value: '6700' },
    ],
    notes: 'Részletek később.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '20px', fontWeight: 600, color: '#0a0a0a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#404040', lineHeight: 1.55, margin: '0 0 16px' }
const card = { backgroundColor: '#f7f7f8', borderRadius: '8px', padding: '12px 16px', margin: '0 0 16px' }
const row = { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#262626', margin: '6px 0' }
const label = { color: '#737373' }
const value = { fontWeight: 600 }
const small = { fontSize: '12px', color: '#737373', margin: '0 0 16px' }
const footer = { fontSize: '12px', color: '#a3a3a3', margin: '24px 0 0' }

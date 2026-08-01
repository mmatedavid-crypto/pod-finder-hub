import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Podiverzum'

interface AdminReportLink {
  label: string
  url: string
  meta?: string
}

interface AdminReportLinkGroup {
  heading?: string
  links: AdminReportLink[]
}

interface AdminReportProps {
  title?: string
  intro?: string
  rows?: Array<{ label: string; value: string }>
  linkGroups?: AdminReportLinkGroup[]
  links?: AdminReportLink[]
  notes?: string
}

const AdminReport = ({ title, intro, rows, linkGroups, links, notes }: AdminReportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{title || `${SITE_NAME} admin report`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{title || 'Admin report'}</Heading>
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
        {linkGroups && linkGroups.length ? linkGroups.map((g, gi) => (
          <Section key={gi} style={linkSection}>
            {g.heading ? <Text style={linkHeading}>{g.heading}</Text> : null}
            {g.links.map((l, i) => (
              <Text key={i} style={linkRow}>
                <Link href={l.url} style={linkAnchor}>{l.label}</Link>
                {l.meta ? <span style={linkMeta}> · {l.meta}</span> : null}
              </Text>
            ))}
          </Section>
        )) : null}
        {links && links.length ? (
          <Section style={linkSection}>
            {links.map((l, i) => (
              <Text key={i} style={linkRow}>
                <Link href={l.url} style={linkAnchor}>{l.label}</Link>
                {l.meta ? <span style={linkMeta}> · {l.meta}</span> : null}
              </Text>
            ))}
          </Section>
        ) : null}
        {notes ? <Text style={small}>{notes}</Text> : null}
        <Text style={footer}>- {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminReport,
  subject: (d: Record<string, any>) => d?.title || 'Podiverzum admin report',
  displayName: 'Admin report',
  previewData: {
    title: 'New people',
    intro: 'AI bios were created for 2 new people.',
    linkGroups: [
      { heading: 'People', links: [
        { label: 'Barack Obama', url: 'https://www.podiverzum.com/person/barack-obama', meta: '15 episodes' },
        { label: 'Donald Trump', url: 'https://www.podiverzum.com/person/donald-trump', meta: '10 episodes' },
      ]},
    ],
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
const linkSection = { margin: '0 0 16px' }
const linkHeading = { fontSize: '13px', fontWeight: 600, color: '#0a0a0a', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const linkRow = { fontSize: '14px', color: '#262626', margin: '4px 0', lineHeight: 1.5 }
const linkAnchor = { color: '#2563eb', textDecoration: 'underline' }
const linkMeta = { color: '#737373', fontSize: '12px' }
const small = { fontSize: '12px', color: '#737373', margin: '0 0 16px' }
const footer = { fontSize: '12px', color: '#a3a3a3', margin: '24px 0 0' }

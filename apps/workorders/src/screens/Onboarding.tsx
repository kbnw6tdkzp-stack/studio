import { useState } from 'react'
import { createBusiness, saveProfile } from '../lib/repo'
import { Field, Select, Section } from '../components/ui'
import { ENTITY } from '../lib/format'
import type { Business } from '../lib/types'

export default function Onboarding({ userId, email }: { userId: string; email: string }) {
  const [name, setName] = useState('')
  const [entity, setEntity] = useState<Business['entity_type']>('sole_proprietor')
  const [legal, setLegal] = useState('')
  const [phone, setPhone] = useState('')
  const [you, setYou] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true)
    await saveProfile({ user_id: userId, full_name: you, phone, email, address: '', title: 'Owner', updated_at: '' })
    await createBusiness(userId, { name, entity_type: entity, legal_name: entity === 'sole_proprietor' ? '' : legal, phone, email })
  }

  return (
    <div className="stack" style={{ maxWidth: 520, margin: '4vh auto 0' }}>
      <h1>Set up your business</h1>
      <p className="muted">This shows on your work orders. You can change all of it later in Settings.</p>
      <Section>
        <Field label="Your name" value={you} onChange={setYou} autoComplete="name" />
        <Field label="Business name" value={name} onChange={setName} placeholder="e.g. Valley Mobile Auto Repair" />
        <Select label="Business type" value={entity} onChange={setEntity}
          options={Object.entries(ENTITY).map(([value, label]) => ({ value: value as Business['entity_type'], label }))} />
        {entity !== 'sole_proprietor' && (
          <Field label="Legal name (as registered)" value={legal} onChange={setLegal} placeholder="e.g. Valley Mobile Auto Repair LLC" />
        )}
        <Field label="Business phone" value={phone} onChange={setPhone} type="tel" inputMode="tel" autoComplete="tel" />
      </Section>
      <button className="block" disabled={busy || !name.trim()} onClick={go}>{busy ? 'Setting up…' : 'Continue'}</button>
    </div>
  )
}

import Dexie, { type Table } from 'dexie'
import type { Business, Customer, Profile, Signature, SignRequest, Vehicle, WorkOrder } from './types'

export type SyncTable = 'businesses' | 'profiles' | 'customers' | 'vehicles' | 'work_orders' | 'sign_requests' | 'signatures'

export interface OutboxItem { seq?: number; table: SyncTable; key: string }
export interface Meta { key: string; value: unknown }

// Everything is kept on the device first, so the app works with no signal.
// Changes queue in "outbox" and go up to Supabase when there's a connection.
class LocalDB extends Dexie {
  businesses!: Table<Business, string>
  profiles!: Table<Profile, string>
  customers!: Table<Customer, string>
  vehicles!: Table<Vehicle, string>
  work_orders!: Table<WorkOrder, string>
  signatures!: Table<Signature, string>
  sign_requests!: Table<SignRequest, string>
  outbox!: Table<OutboxItem, number>
  meta!: Table<Meta, string>
  constructor() {
    super('workorders')
    this.version(1).stores({
      businesses: 'id',
      profiles: 'user_id',
      customers: 'id, business_id, name, updated_at',
      vehicles: 'id, business_id, customer_id, vin',
      work_orders: 'id, business_id, customer_id, vehicle_id, number, status, created_at',
      signatures: 'id, work_order_id',
      outbox: '++seq, table, key',
      meta: 'key',
    })
    this.version(2).stores({ sign_requests: 'id, work_order_id, business_id' })
  }
}

export const db = new LocalDB()

export const getMeta = async <T,>(key: string): Promise<T | undefined> => (await db.meta.get(key))?.value as T | undefined
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })

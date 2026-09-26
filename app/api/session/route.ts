import { NextResponse } from 'next/server'
import { issueToken } from '@/lib/session'

export async function GET() {
  return NextResponse.json({ token: issueToken() })
}

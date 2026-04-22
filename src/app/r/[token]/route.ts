import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.redirect('https://google.com')
}
import { NextRequest, NextResponse } from 'next/server'

const PIXEL =
  'R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='

export async function GET() {
  const buffer = Buffer.from(PIXEL, 'base64')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/gif',
    },
  })
}
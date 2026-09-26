import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { isValidToken } from '@/lib/session'
import {
  LIMITS,
  clientIp,
  escapeHtml,
  isAllowedRequestOrigin,
  isJsonContentType,
  isValidIsoDate,
  isValidTime,
  jsonError,
  missingEnv,
  rateLimit,
  withinLength,
} from '@/lib/security'

export interface ScheduleCallRequest {
  requestedDate: string
  requestedTime: string
  requestedDateTime: string
}

export async function POST(request: NextRequest) {
  try {
    if (!isJsonContentType(request)) {
      return jsonError('Unsupported media type', 415)
    }

    if (!isAllowedRequestOrigin(request)) {
      return jsonError('Forbidden', 403)
    }

    const ip = clientIp(request)
    if (!rateLimit(`schedule-call:${ip}`)) {
      return jsonError('Too many requests. Try again later.', 429)
    }

    const sessionToken = request.headers.get('x-portfolio-token') || ''
    if (!isValidToken(sessionToken)) {
      return NextResponse.json(
        {
          error: 'Your session expired. Refresh your token and try again.',
          code: 'TOKEN_INVALID',
        },
        { status: 400 }
      )
    }

    const envError = missingEnv(['RESEND_API_KEY'])
    if (envError) {
      console.error(`Missing environment variables: ${envError}`)
      return jsonError('Scheduling is not configured', 503)
    }

    const payload = (await request.json()) as Partial<ScheduleCallRequest>
    const requestedDate =
      typeof payload.requestedDate === 'string' ? payload.requestedDate.trim() : ''
    const requestedTime =
      typeof payload.requestedTime === 'string' ? payload.requestedTime.trim() : ''
    const requestedDateTime =
      typeof payload.requestedDateTime === 'string' ? payload.requestedDateTime.trim() : ''

    if (
      !withinLength(requestedDate, LIMITS.date) ||
      !withinLength(requestedTime, LIMITS.time) ||
      (requestedDateTime && requestedDateTime.length > LIMITS.isoDateTime)
    ) {
      return jsonError('Invalid or missing fields', 400)
    }

    if (!isValidIsoDate(requestedDate) || !isValidTime(requestedTime)) {
      return jsonError('Invalid date or time', 400)
    }

    if (requestedDateTime && Number.isNaN(Date.parse(requestedDateTime))) {
      return jsonError('Invalid datetime', 400)
    }

    const safeDate = escapeHtml(
      new Date(`${requestedDate}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    )
    const safeTime = escapeHtml(requestedTime)
    const utcDisplay = requestedDateTime
      ? escapeHtml(
          new Date(requestedDateTime).toLocaleString('en-US', {
            timeZone: 'UTC',
            dateStyle: 'full',
            timeStyle: 'short',
          })
        )
      : ''

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">1:1 Call Request</h2>

        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #374151;">Requested Time</h3>
          <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: #1f2937;">
            Date: ${safeDate}
          </p>
          <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: #1f2937;">
            Time: ${safeTime}
          </p>
          ${
            utcDisplay
              ? `<p style="margin: 5px 0; font-size: 16px; color: #6b7280;">UTC Time: ${utcDisplay}</p>`
              : ''
          }
        </div>

        <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #065f46;">
            <strong>Next Steps:</strong> Please reply to this email to confirm the meeting time or suggest an alternative.
          </p>
        </div>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">

        <p style="color: #6b7280; font-size: 14px;">
          This scheduling request was made via your portfolio website calendar.
        </p>
      </div>
    `

    const resend = new Resend(process.env.RESEND_API_KEY)
    const toAddress =
      process.env.SCHEDULE_TO_EMAIL?.trim() ||
      process.env.CONTACT_TO_EMAIL?.trim() ||
      process.env.GMAIL_USER

    if (!toAddress) {
      return jsonError('Scheduling is not configured', 503)
    }

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL?.trim() || 'Portfolio Scheduling <onboarding@resend.dev>',
      to: [toAddress],
      subject: `1:1 Call Request - ${requestedDate} ${requestedTime}`,
      html: emailHtml,
    })

    if (error) {
      console.error('Resend error')
      return jsonError('Failed to send email', 500)
    }

    return NextResponse.json({
      message: 'Schedule request sent successfully!',
    })
  } catch {
    console.error('API Error')
    return jsonError('Internal server error', 500)
  }
}

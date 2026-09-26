import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { isValidToken, reserveEmailSendSlot } from '@/lib/session'
import {
  LIMITS,
  clientIp,
  escapeHtml,
  isAllowedRequestOrigin,
  isJsonContentType,
  isValidEmail,
  isValidIsoDate,
  isValidTime,
  jsonError,
  missingEnv,
  rateLimit,
  withinLength,
} from '@/lib/security'

export async function POST(request: NextRequest) {
  try {
    if (!isJsonContentType(request)) {
      return jsonError('Unsupported media type', 415)
    }

    if (!isAllowedRequestOrigin(request)) {
      return jsonError('Forbidden', 403)
    }

    const ip = clientIp(request)
    if (!rateLimit(`send-email:${ip}`)) {
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

    const envError = missingEnv(['GMAIL_USER', 'GMAIL_APP_PASSWORD'])
    if (envError) {
      console.error(`Missing environment variables: ${envError}`)
      return jsonError('Email is not configured', 503)
    }

    const payload = await request.json()
    const email = typeof payload.email === 'string' ? payload.email.trim() : ''
    const date = typeof payload.date === 'string' ? payload.date.trim() : ''
    const time = typeof payload.time === 'string' ? payload.time.trim() : ''
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : ''
    const body = typeof payload.body === 'string' ? payload.body.trim() : ''

    if (
      !withinLength(email, LIMITS.email) ||
      !withinLength(date, LIMITS.date) ||
      !withinLength(time, LIMITS.time) ||
      !withinLength(subject, LIMITS.subject) ||
      !withinLength(body, LIMITS.body)
    ) {
      return jsonError('Invalid or missing fields', 400)
    }

    if (!isValidEmail(email) || !isValidIsoDate(date) || !isValidTime(time)) {
      return jsonError('Invalid email, date, or time', 400)
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const formattedTime = new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })

    const safeEmail = escapeHtml(email)
    const safeSubject = escapeHtml(subject)
    const safeBody = escapeHtml(body)
    const safeDate = escapeHtml(formattedDate)
    const safeTime = escapeHtml(formattedTime)
    const recipient = process.env.CONTACT_TO_EMAIL?.trim() || process.env.GMAIL_USER

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: recipient,
      replyTo: email,
      subject: `Portfolio Contact: ${subject.replace(/[\r\n]/g, ' ').slice(0, LIMITS.subject)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a73e8; margin: 0; font-size: 24px;">New Portfolio Contact</h1>
              <p style="color: #666; margin: 10px 0 0 0;">Someone reached out through your portfolio website</p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #333; margin: 0 0 15px 0; font-size: 18px;">Contact Details</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #555; width: 120px;">From Email:</td>
                  <td style="padding: 8px 0; color: #333;">${safeEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #555;">Date:</td>
                  <td style="padding: 8px 0; color: #333;">${safeDate}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #555;">Time:</td>
                  <td style="padding: 8px 0; color: #333;">${safeTime}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #555;">Subject:</td>
                  <td style="padding: 8px 0; color: #333;">${safeSubject}</td>
                </tr>
              </table>
            </div>
            
            <div style="margin-bottom: 20px;">
              <h2 style="color: #333; margin: 0 0 15px 0; font-size: 18px;">Message</h2>
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #1a73e8;">
                <p style="margin: 0; color: #333; line-height: 1.6; white-space: pre-wrap;">${safeBody}</p>
              </div>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; margin: 0; font-size: 14px;">
                This email was sent from your portfolio website contact form.
              </p>
            </div>
          </div>
        </div>
      `,
    }

    // Reserve one of the 2-per-minute global send slots. Placed after all
    // validation so rejected attempts never consume Gmail quota.
    const reservation = reserveEmailSendSlot()
    if (!reservation.allowed) {
      const retryAfterSeconds = Math.ceil(reservation.retryAfterMs / 1000)
      return NextResponse.json(
        {
          error: `Email limit reached — only 2 emails per minute can be sent. Please try again in ${retryAfterSeconds} seconds.`,
          retryAfterSeconds,
        },
        { status: 429 }
      )
    }

    await transporter.sendMail(mailOptions)

    return NextResponse.json(
      { message: 'Email sent successfully!' },
      { status: 200 }
    )
  } catch {
    console.error('Error sending email')
    return jsonError('Failed to send email', 500)
  }
}

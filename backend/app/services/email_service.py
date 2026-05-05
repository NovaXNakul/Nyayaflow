import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

# Logger setup
logger = logging.getLogger(__name__)

# Mandatory Env Config
EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")
EMAIL_SERVICE = os.getenv("EMAIL_SERVICE", "gmail").lower()

# NodeMailer-style service mapping
SERVICE_MAP = {
    "gmail": {"host": "smtp.gmail.com", "port": 587},
    "outlook": {"host": "smtp-mail.outlook.com", "port": 587},
    "yahoo": {"host": "smtp.mail.yahoo.com", "port": 465},
    "icloud": {"host": "smtp.mail.me.com", "port": 587},
}

def send_reset_email(to_email: str, reset_link: str):
    """
    Sends a password reset email using a premium HTML template.
    Configuration is pulled from EMAIL_USER, EMAIL_PASS, and EMAIL_SERVICE.
    """
    if not EMAIL_USER or not EMAIL_PASS:
        logger.warning("EMAIL_USER or EMAIL_PASS not set. Email cannot be sent.")
        logger.info(f"DEBUG: Reset link for {to_email} would be: {reset_link}")
        return

    # Get service config
    config = SERVICE_MAP.get(EMAIL_SERVICE, SERVICE_MAP["gmail"])
    host = config["host"]
    port = config["port"]

    subject = "Reset Your Password - Court Decision Intelligence"
    
    # Premium HTML Template
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <div style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);">
                        
                        <!-- Premium Gradient Header -->
                        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #3b82f6 100%); padding: 48px 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">Court Intelligence</h1>
                            <p style="color: #bfdbfe; margin: 8px 0 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em;">Secure Access Portal</p>
                        </div>
                        
                        <!-- Content -->
                        <div style="padding: 48px 40px;">
                            <h2 style="margin: 0 0 24px 0; color: #0f172a; font-size: 22px; font-weight: 700; line-height: 1.2;">Reset Your Password</h2>
                            
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #475569;">
                                Hello, we received a request to reset the password for your Court Decision Intelligence account. No changes have been made yet.
                            </p>
                            
                            <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 1.6; color: #475569;">
                                You can reset your password by clicking the secure button below:
                            </p>
                            
                            <!-- Large CTA Button -->
                            <div style="text-align: center; margin: 40px 0;">
                                <a href="{reset_link}" style="background-color: #2563eb; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; transition: all 0.2s ease; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                                    Reset Password
                                </a>
                            </div>
                            
                            <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 32px; border-left: 4px solid #3b82f6;">
                                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #1e293b;">
                                    <strong>Important Note:</strong> This link will expire in <strong>15 minutes</strong> for your security. If you didn't request this, you can safely ignore this email.
                                </p>
                            </div>
                            
                            <p style="margin: 0 0 8px 0; font-size: 14px; color: #94a3b8;">
                                If the button above doesn't work, copy and paste this link into your browser:
                            </p>
                            <p style="margin: 0; font-size: 13px; color: #3b82f6; word-break: break-all;">
                                <a href="{reset_link}" style="color: #3b82f6; text-decoration: underline;">{reset_link}</a>
                            </p>
                        </div>
                        
                        <!-- Footer -->
                        <div style="padding: 32px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
                            <p style="margin: 0 0 16px 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                                &copy; 2026 Court Decision Intelligence System. <br>
                                Building the future of legal intelligence.
                            </p>
                            <div style="display: inline-block; border-top: 2px solid #e2e8f0; width: 40px; margin-bottom: 16px;"></div>
                            <p style="margin: 0; font-size: 11px; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.05em;">
                                Automated System Message • Do Not Reply
                            </p>
                        </div>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    msg = MIMEMultipart()
    msg['From'] = f"Court Intelligence <{EMAIL_USER}>"
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(html_content, 'html'))

    try:
        # Connect and Send
        if port == 465:
            server = smtplib.SMTP_SSL(host, port)
        else:
            server = smtplib.SMTP(host, port)
            server.starttls()
            
        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)
        server.quit()
        logger.info(f"Reset email successfully sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False

def send_welcome_email(to_email: str, name: str, role: str):
    """
    Sends a welcome email using a premium HTML template.
    Configuration is pulled from EMAIL_USER, EMAIL_PASS, and EMAIL_SERVICE.
    """
    if not EMAIL_USER or not EMAIL_PASS:
        logger.warning("EMAIL_USER or EMAIL_PASS not set. Email cannot be sent.")
        return False

    config = SERVICE_MAP.get(EMAIL_SERVICE, SERVICE_MAP["gmail"])
    host = config["host"]
    port = config["port"]

    subject = "Welcome to the System - Court Decision Intelligence"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to the System</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <div style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);">
                        
                        <!-- Premium Gradient Header -->
                        <div style="background: linear-gradient(135deg, #0f172a 0%, #10b981 50%, #059669 100%); padding: 48px 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">Court Intelligence</h1>
                            <p style="color: #a7f3d0; margin: 8px 0 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em;">Secure Access Portal</p>
                        </div>
                        
                        <!-- Content -->
                        <div style="padding: 48px 40px;">
                            <h2 style="margin: 0 0 24px 0; color: #0f172a; font-size: 22px; font-weight: 700; line-height: 1.2;">Welcome to the System</h2>
                            
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #475569;">
                                Hello <strong>{name}</strong>,
                            </p>
                            
                            <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 1.6; color: #475569;">
                                Your account has been successfully created. You are registered with the role of <strong>{role.capitalize()}</strong>.
                            </p>
                            
                            <!-- Large CTA Button -->
                            <div style="text-align: center; margin: 40px 0;">
                                <a href="http://localhost:3000/login" style="background-color: #10b981; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; transition: all 0.2s ease; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);">
                                    Sign In Now
                                </a>
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div style="padding: 32px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
                            <p style="margin: 0 0 16px 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                                &copy; 2026 Court Decision Intelligence System. <br>
                                Building the future of legal intelligence.
                            </p>
                            <div style="display: inline-block; border-top: 2px solid #e2e8f0; width: 40px; margin-bottom: 16px;"></div>
                            <p style="margin: 0; font-size: 11px; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.05em;">
                                Automated System Message • Do Not Reply
                            </p>
                        </div>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    msg = MIMEMultipart()
    msg['From'] = f"Court Intelligence <{EMAIL_USER}>"
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(html_content, 'html'))

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port)
        else:
            server = smtplib.SMTP(host, port)
            server.starttls()
            
        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)
        server.quit()
        logger.info(f"Welcome email successfully sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send welcome email to {to_email}: {str(e)}")
        return False

def send_invite_email(to_email: str, name: str, invite_link: str):
    """
    Sends a professional invitation email to an officer using a premium HTML template.
    """
    if not EMAIL_USER or not EMAIL_PASS:
        logger.warning("EMAIL_USER or EMAIL_PASS not set. Email cannot be sent.")
        logger.info(f"DEBUG: Invite link for {to_email} would be: {invite_link}")
        return False

    config = SERVICE_MAP.get(EMAIL_SERVICE, SERVICE_MAP["gmail"])
    host = config["host"]
    port = config["port"]

    subject = "You're Invited as an Officer - Court Decision Intelligence"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You're Invited as an Officer</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
            <tr>
                <td align="center" style="padding: 60px 20px;">
                    <div style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); border: 1px solid #e2e8f0;">
                        
                        <!-- Header with Modern Gradient -->
                        <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 50px 40px; text-align: center;">
                            <div style="background-color: rgba(255, 255, 255, 0.2); width: 64px; h-64px; border-radius: 16px; margin: 0 auto 20px auto; padding: 12px; display: inline-block;">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="color: #ffffff;">
                                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">Court Intelligence</h1>
                        </div>
                        
                        <!-- Main Content Body -->
                        <div style="padding: 50px 45px; text-align: center;">
                            <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 26px; font-weight: 800; line-height: 1.1;">You're Invited</h2>
                            
                            <p style="margin: 0 0 25px 0; font-size: 17px; line-height: 1.6; color: #4b5563;">
                                Hello <strong>{name}</strong>,
                            </p>
                            
                            <p style="margin: 0 0 35px 0; font-size: 16px; line-height: 1.7; color: #4b5563;">
                                You have been invited to join the <strong>Court Decision Intelligence System</strong> as an <strong>Officer</strong>. You will have access to powerful tools for analyzing court directives and managing compliance workflows.
                            </p>
                            
                            <!-- CTA Button Section -->
                            <div style="margin: 45px 0;">
                                <a href="{invite_link}" style="background-color: #4f46e5; color: #ffffff; padding: 18px 45px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; display: inline-block; transition: all 0.3s ease; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.4);">
                                    Accept Invitation
                                </a>
                            </div>
                            
                            <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 25px; margin-top: 45px;">
                                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #64748b;">
                                    <strong>Expiry Warning:</strong> This invitation is secure and unique to you. It will expire in <strong>24 hours</strong>. If you did not expect this invitation, you can safely ignore this email.
                                </p>
                            </div>
                        </div>
                        
                        <!-- Footer Section -->
                        <div style="padding: 35px 45px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0 0 10px 0; font-size: 12px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">
                                Security & Privacy Notice
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                                This is an automated invitation from GovOS Court Intelligence System. Please do not reply to this email address.
                            </p>
                        </div>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    msg = MIMEMultipart()
    msg['From'] = f"GovOS Court Intelligence <{EMAIL_USER}>"
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(html_content, 'html'))

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port)
        else:
            server = smtplib.SMTP(host, port)
            server.starttls()
            
        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)
        server.quit()
        logger.info(f"Invite email successfully sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send invite email to {to_email}: {str(e)}")
        return False

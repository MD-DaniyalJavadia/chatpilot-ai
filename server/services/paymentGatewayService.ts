import crypto from 'node:crypto';

export type PaymentProviderName = 'Stripe' | 'ManualInvoice' | 'SandboxCard';

export interface CheckoutChargeInput {
  businessId: number;
  planCode: string;
  planName: string;
  billingCycle: 'Monthly' | 'Yearly';
  amountUsd: number;
  provider: PaymentProviderName;
}

export interface CheckoutChargeResult {
  provider: PaymentProviderName;
  externalTxnId: string;
  status: 'Succeeded' | 'Pending';
  paidOn: string | null;
  gatewayMessage: string;
}

export interface IPaymentGateway {
  readonly providerName: PaymentProviderName;
  processSubscriptionCharge(input: CheckoutChargeInput): Promise<CheckoutChargeResult>;
}

class SandboxCardGateway implements IPaymentGateway {
  readonly providerName: PaymentProviderName = 'SandboxCard';

  async processSubscriptionCharge(input: CheckoutChargeInput): Promise<CheckoutChargeResult> {
    if (input.amountUsd > 0 && !isSandboxBillingEnabled()) {
      throw new Error('Sandbox card checkout is disabled in production mode.');
    }
    const ref = `ch_sbx_${crypto.randomBytes(8).toString('hex')}`;
    return {
      provider: 'SandboxCard',
      externalTxnId: ref,
      status: 'Succeeded',
      paidOn: new Date().toISOString(),
      gatewayMessage:
        input.amountUsd <= 0
          ? `Activated ${input.planName} ($0.00).`
          : `Processed $${input.amountUsd.toFixed(2)} ${input.billingCycle.toLowerCase()} settlement.`,
    };
  }
}

class ManualInvoiceGateway implements IPaymentGateway {
  readonly providerName: PaymentProviderName = 'ManualInvoice';

  async processSubscriptionCharge(input: CheckoutChargeInput): Promise<CheckoutChargeResult> {
    const ref = `inv_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${crypto.randomBytes(4).toString('hex')}`;
    const isFree = input.amountUsd <= 0;
    return {
      provider: 'ManualInvoice',
      externalTxnId: ref,
      status: isFree ? 'Succeeded' : 'Pending',
      paidOn: isFree ? new Date().toISOString() : null,
      gatewayMessage: isFree
        ? `Activated ${input.planName} without charge.`
        : `Invoice ${ref} issued ($${input.amountUsd.toFixed(2)}). Super Admin confirmation marks payment settled.`,
    };
  }
}

class StripeGateway implements IPaymentGateway {
  readonly providerName: PaymentProviderName = 'Stripe';

  async processSubscriptionCharge(input: CheckoutChargeInput): Promise<CheckoutChargeResult> {
    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeKey) {
      throw new Error('Stripe live billing requires STRIPE_SECRET_KEY in server environment secrets.');
    }

    if (input.amountUsd <= 0) {
      return {
        provider: 'Stripe',
        externalTxnId: `sub_free_${crypto.randomBytes(6).toString('hex')}`,
        status: 'Succeeded',
        paidOn: new Date().toISOString(),
        gatewayMessage: `Activated ${input.planName} ($0.00).`,
      };
    }

    // Create a Stripe PaymentIntent in test/live mode via server-side HTTPS call (no client key exposure)
    const body = new URLSearchParams({
      amount: String(Math.round(input.amountUsd * 100)),
      currency: 'usd',
      'metadata[businessId]': String(input.businessId),
      'metadata[planCode]': input.planCode,
      'metadata[billingCycle]': input.billingCycle,
      description: `ChatPilot AI ${input.planName} (${input.billingCycle})`,
    });

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const json = (await response.json()) as { id?: string; error?: { message?: string } };
    if (!response.ok || !json.id) {
      throw new Error(json.error?.message || 'Unable to create Stripe payment intent.');
    }

    return {
      provider: 'Stripe',
      externalTxnId: json.id,
      status: 'Pending',
      paidOn: null,
      gatewayMessage: `Stripe PaymentIntent ${json.id} initialized.`,
    };
  }
}

const gateways: Record<PaymentProviderName, IPaymentGateway> = {
  SandboxCard: new SandboxCardGateway(),
  ManualInvoice: new ManualInvoiceGateway(),
  Stripe: new StripeGateway(),
};

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function isSandboxBillingEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_SANDBOX_BILLING === 'true';
}

export async function executeSubscriptionCheckout(
  input: CheckoutChargeInput
): Promise<CheckoutChargeResult> {
  const gateway = gateways[input.provider];
  if (!gateway) {
    throw new Error('Unsupported payment provider.');
  }
  return gateway.processSubscriptionCharge(input);
}

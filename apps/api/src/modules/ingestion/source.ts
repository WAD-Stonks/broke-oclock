export const MONEYDIGEST_SOURCE = {
  provider: 'WORDPRESS' as const,
  externalId: 'moneydigest.sg',
  name: 'MoneyDigest',
  url: 'https://www.moneydigest.sg/',
}
export const sourceWhere = {
  provider_externalId: {
    provider: MONEYDIGEST_SOURCE.provider,
    externalId: MONEYDIGEST_SOURCE.externalId,
  },
}

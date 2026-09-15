export class EmailConfigurationError extends Error {
  constructor() {
    super('Email service is not configured')
    this.name = 'EmailConfigurationError'
  }
}

export class EmailInputError extends Error {
  constructor() {
    super('Invalid email request')
    this.name = 'EmailInputError'
  }
}

export class EmailProviderError extends Error {
  constructor() {
    super('Email provider request failed')
    this.name = 'EmailProviderError'
  }
}

export class EmailNetworkError extends Error {
  constructor() {
    super('Email provider network request failed')
    this.name = 'EmailNetworkError'
  }
}

export class EmailTimeoutError extends Error {
  constructor() {
    super('Email provider request timed out')
    this.name = 'EmailTimeoutError'
  }
}

import { z } from 'zod'

export const moneyDigestPostSchema = z.object({
  id: z.number().int().positive(),
  link: z
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value)
      return url.origin === 'https://www.moneydigest.sg' && !url.username && !url.password
    }),
  date: z.string().max(64).nullable(),
  title: z.object({ rendered: z.string().max(2000) }),
  content: z.object({ rendered: z.string().max(100_000) }),
  excerpt: z.object({ rendered: z.string().max(10_000) }),
})

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  copy: '©',
  reg: '®',
}
// Text extraction, NOT an HTML sanitizer: the result must only be rendered as text.
const plainText = (html: string) =>
  html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<[^>]*(?:>|$)/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (original, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? original
      const point =
        entity[1]?.toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number(entity.slice(1))
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : '�'
    })
    .replace(/./gs, (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character,
    )
    .replace(/\s+/g, ' ')
    .trim()
const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const parseDateOnly = (value: string): Date | null => {
  const parts = value.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/i)
  if (!parts) return null
  const day = Number(parts[1])
  const month = months.indexOf((parts[2] ?? '').toLowerCase())
  const year = Number(parts[3])
  if (month < 0 || year < 2000 || year > 2100) return null
  const utc = new Date(Date.UTC(year, month, day))
  return utc.getUTCDate() === day && utc.getUTCMonth() === month
    ? new Date(utc.getTime() - 8 * 60 * 60 * 1000)
    : null
}
const parseValidity = (text: string) => {
  const statements = [
    ...text.matchAll(
      /\b(?:valid\s+(?:from|until|till|to)|ends?\s+(?:on|until)|while stocks last)[^.?!]*/gi,
    ),
  ].map((match) => match[0])
  const rawValidityText = statements.length ? statements.join('. ').slice(0, 500) : null
  if (statements.length > 1) return { rawValidityText, validFrom: null, validUntil: null }
  const range = rawValidityText?.match(/^valid from (.+?) (?:until|to) (.+)$/i)
  const endOnly = rawValidityText?.match(/^(?:valid (?:until|till|to)|ends? (?:on|until)) (.+)$/i)
  const validFrom = range ? parseDateOnly(range[1] ?? '') : null
  const end = parseDateOnly(range?.[2] ?? endOnly?.[1] ?? '')
  const validUntil = end ? new Date(end.getTime() + 24 * 60 * 60 * 1000) : null
  if ((range && !validFrom) || (validFrom && validUntil && validFrom >= validUntil))
    return { rawValidityText, validFrom: null, validUntil: null }
  return { rawValidityText, validFrom, validUntil }
}

type Token = {
  kind: 'word' | 'digits' | 'identifier' | 'currency' | 'percent' | 'punctuation'
  value: string
  start: number
  end: number
}
type NumericCandidate = {
  kind: 'currency' | 'percent'
  start: number
  end: number
  raw: string
  supported: boolean
  value: number | null
  fixed: boolean
}
// Identifiers are maximal: never rescue a known word/digit from an adjoining
// letter, digit, underscore or combining mark. Explicit currency syntax is the
// only lexical prefix grammar; an independent marker inventory below also keeps
// markers swallowed inside identifiers as unsupported evidence.
const lex = (text: string): Token[] =>
  [...text.matchAll(/S\$|SGD|\$|%|[\p{L}\p{N}\p{M}_]+|[^\s]/giu)].map((match) => {
    const value = match[0].toLowerCase()
    return {
      kind: /^(?:s\$|sgd|\$)$/.test(value)
        ? 'currency'
        : value === '%'
          ? 'percent'
          : /^[a-z]+$/.test(value)
            ? 'word'
            : /^\d+$/.test(value)
              ? 'digits'
              : /^[\p{L}\p{N}\p{M}_]+$/u.test(value)
                ? 'identifier'
                : 'punctuation',
      value,
      start: match.index,
      end: match.index + match[0].length,
    }
  })
const numericAtom = (token: Token | undefined) =>
  token?.kind === 'digits' || token?.kind === 'identifier' || token?.kind === 'punctuation'
const validityStart = (token: Token | undefined) =>
  token?.kind === 'word' && ['valid', 'end', 'ends', 'while'].includes(token.value)
const fixedWord = (token: Token | undefined) =>
  token?.kind === 'word' && ['only', 'deal', 'special', 'promotion'].includes(token.value)

// Anchors create candidates even when their numeric operand is malformed/missing.
// Numeric atoms are consumed maximally; validation happens only on the whole span.
const scanNumericCandidates = (text: string, tokens: Token[]): NumericCandidate[] => {
  const candidates: NumericCandidate[] = []
  const currencyStarts = new Set(
    tokens.filter((token) => token.kind === 'currency').map((token) => token.start),
  )
  for (const marker of text.matchAll(/S\$|SGD|\$/gi)) {
    if (!currencyStarts.has(marker.index))
      candidates.push({
        kind: 'currency',
        start: marker.index,
        end: marker.index + marker[0].length,
        raw: marker[0],
        supported: false,
        value: null,
        fixed: false,
      })
  }
  let consumedThrough = -1
  for (let index = 0; index < tokens.length; index++) {
    const anchor = tokens[index]
    if (!anchor) continue
    if (anchor.kind === 'word' && ['percent', 'percentage'].includes(anchor.value)) {
      candidates.push({
        kind: 'percent',
        start: anchor.start,
        end: anchor.end,
        raw: anchor.value,
        supported: false,
        value: null,
        fixed: false,
      })
      continue
    }
    if (anchor.kind !== 'currency' && anchor.kind !== 'percent') continue
    if (anchor.kind === 'currency') {
      let end = index + 1
      while (numericAtom(tokens[end])) end++
      // A price followed by a percentage has two operands. Split only at a
      // whitespace boundary between digit runs, never at a separator or sign.
      if (tokens[end]?.kind === 'percent') {
        // Only a complete initial digits-dot-two-digits operand can split.
        // Inspect its bounded token prefix once, never growing slices in a loop.
        const whole = tokens[index + 1]
        const dot = tokens[index + 2]
        const fraction = tokens[index + 3]
        const next = tokens[index + 4]
        if (
          whole?.kind === 'digits' &&
          dot?.value === '.' &&
          fraction?.kind === 'digits' &&
          fraction.value.length === 2 &&
          whole.end === dot.start &&
          dot.end === fraction.start &&
          next?.kind === 'digits' &&
          next.start > fraction.end
        )
          end = index + 4
      }
      // Sentence grammar permits a full stop after a complete two-decimal price.
      // An integer followed by a dot could instead be a malformed decimal: do
      // not guess. Integer prices remain supported before explicit price words.
      const last = tokens[end - 1]
      const operandStart = tokens[index + 1]?.start ?? anchor.end
      if (
        last?.value === '.' &&
        (end === tokens.length || validityStart(tokens[end])) &&
        /^\d+\.\d{2}$/.test(text.slice(operandStart, last.start))
      )
        end--
      const first = tokens[index + 1]
      const operandEnd = end > index + 1 ? (tokens[end - 1]?.end ?? anchor.end) : anchor.end
      const raw = first && end > index + 1 ? text.slice(first.start, operandEnd) : ''
      const attachedWord = tokens[end]?.kind === 'word' && tokens[end]?.start === operandEnd
      const prefix = tokens[index - 1]
      // Prefix signs/symbols and adjoining identifiers belong to the candidate,
      // not an independently valid currency suffix. Prose sentence delimiters
      // before a marker are separate tokens; all other symbol prefixes are unsafe.
      const unsupportedPrefix =
        prefix &&
        ((prefix.kind !== 'punctuation' && prefix.end === anchor.start) ||
          (prefix.kind === 'punctuation' && !['.', ',', ';', ':', '!', '?'].includes(prefix.value)))
      const candidateStart = unsupportedPrefix ? prefix.start : anchor.start
      const [whole = '', fraction = '0'] = raw.split('.')
      const minor = Number(whole) * 100 + Number(fraction)
      const supported =
        /^\d+(?:\.\d{2})?$/.test(raw) &&
        !attachedWord &&
        !unsupportedPrefix &&
        Number.isSafeInteger(minor) &&
        minor >= 0 &&
        minor <= 1_000_000
      candidates.push({
        kind: 'currency',
        start: candidateStart,
        end: operandEnd,
        raw: text.slice(candidateStart, operandEnd),
        supported,
        value: supported ? minor : null,
        fixed: fixedWord(tokens[index - 1]) || fixedWord(tokens[end]),
      })
      consumedThrough = end - 1
    } else {
      let start = index
      while (start > consumedThrough + 1 && numericAtom(tokens[start - 1])) start--
      const first = tokens[start]
      const last = tokens[index - 1]
      const raw = start < index && first && last ? text.slice(first.start, last.end) : ''
      const previous = tokens[start - 1]
      const attachedWord = previous?.kind === 'word' && previous.end === first?.start
      const keyword = tokens[index + 1]
      const suffix = tokens[index + 2]
      const operatorNumericSuffix =
        keyword &&
        suffix?.start === keyword.end &&
        (suffix.kind === 'digits' ||
          suffix.kind === 'identifier' ||
          (suffix.kind === 'punctuation' && numericAtom(tokens[index + 3])))
      const supported =
        /^\d{1,3}$/.test(raw) &&
        !attachedWord &&
        !operatorNumericSuffix &&
        keyword?.kind === 'word' &&
        ['off', 'discount'].includes(keyword.value) &&
        Number(raw) > 0 &&
        Number(raw) <= 100
      candidates.push({
        kind: 'percent',
        start: first?.start ?? anchor.start,
        end: keyword?.end ?? anchor.end,
        raw,
        supported,
        value: supported ? Number(raw) : null,
        fixed: false,
      })
      consumedThrough = index
    }
  }
  return candidates
}

// Finite BOGO grammar. Recognition and continuation checking use the same
// token stream; no validity prefix can short-circuit the end-of-field check.
const punctuation = (token: Token | undefined) =>
  token?.kind === 'punctuation' && /^\p{P}$/u.test(token.value)
const skipPunctuation = (tokens: Token[], start: number) => {
  let cursor = start
  while (punctuation(tokens[cursor])) cursor++
  return cursor
}
const consumeValues = (tokens: Token[], start: number, values: string[]) => {
  let cursor = start
  for (const [index, value] of values.entries()) {
    if (index) cursor = skipPunctuation(tokens, cursor)
    if (tokens[cursor]?.value !== value) return null
    cursor++
  }
  return cursor
}
const consumeDate = (tokens: Token[], start: number) => {
  if (tokens[start]?.kind !== 'digits' || !months.includes(tokens[start + 1]?.value ?? ''))
    return null
  let cursor = start + 2
  // Missing years are consumed as unknown validity, never inferred. This keeps
  // incomplete-date drafts reviewable for REJECT without making them approvable.
  if (tokens[cursor]?.kind === 'digits') cursor++
  return cursor
}
const consumeValidity = (tokens: Token[], start: number) => {
  const word = tokens[start]?.value
  const mode = tokens[start + 1]?.value
  if (word === 'while') return consumeValues(tokens, start, ['while', 'stocks', 'last'])
  if (word === 'valid' && mode === 'from') {
    const from = consumeDate(tokens, start + 2)
    if (from === null || !['until', 'to'].includes(tokens[from]?.value ?? '')) return null
    return consumeDate(tokens, from + 1)
  }
  if (
    (word === 'valid' && ['until', 'till', 'to'].includes(mode ?? '')) ||
    (['end', 'ends'].includes(word ?? '') && ['on', 'until'].includes(mode ?? ''))
  )
    return consumeDate(tokens, start + 2)
  return null
}
const completeBogoSuffix = (tokens: Token[], start: number) => {
  let cursor = skipPunctuation(tokens, start)
  if (tokens[cursor]?.value === 'free') cursor = skipPunctuation(tokens, cursor + 1)
  if (fixedWord(tokens[cursor])) cursor = skipPunctuation(tokens, cursor + 1)
  if (cursor === tokens.length) return true
  const validityEnd = consumeValidity(tokens, cursor)
  return validityEnd !== null && skipPunctuation(tokens, validityEnd) === tokens.length
}
const scanBogoCandidates = (tokens: Token[]) => {
  const candidates: { start: number; end: number; complete: boolean; supported: boolean }[] = []
  for (let start = 0; start < tokens.length; start++) {
    for (const phrase of [
      ['buy', 'one', 'get', 'one'],
      ['1', 'for', '1'],
      ['one', 'for', 'one'],
    ]) {
      const end = consumeValues(tokens, start, phrase)
      if (end !== null) {
        const previous = tokens[start - 1]
        const next = tokens[end]
        const numericPrefix =
          (tokens[start]?.kind === 'digits' || tokens[start]?.value === 'one') &&
          previous &&
          (previous.kind === 'digits' ||
            previous.kind === 'identifier' ||
            (previous.kind === 'punctuation' &&
              (!['.', ',', ';', ':', '!', '?'].includes(previous.value) ||
                numericAtom(tokens[start - 2]))))
        const numericSuffix =
          phrase[0] !== 'buy' &&
          next &&
          (next.kind === 'digits' ||
            next.kind === 'identifier' ||
            (next.value === 'e' && numericAtom(tokens[end + 1])) ||
            (next.kind === 'punctuation' &&
              (!['.', ',', ';', ':', '!', '?', '"', "'", '“', '”', '‘', '’'].includes(next.value) ||
                numericAtom(tokens[end + 1]))))
        // Ratio separators are whitespace or a single dash on either side,
        // for both numeric and word operands. Buy/get retains punctuation grammar.
        const operator = skipPunctuation(tokens, start + 1)
        const operand = skipPunctuation(tokens, operator + 1)
        const numericSeparators =
          phrase[0] === 'buy' ||
          [tokens.slice(start + 1, operator), tokens.slice(operator + 1, operand)].every(
            (separator) =>
              separator.length === 0 ||
              (separator.length === 1 && ['-', '–', '—'].includes(separator[0]?.value ?? '')),
          )
        candidates.push({
          start,
          end,
          supported: !numericPrefix && !numericSuffix && numericSeparators,
          complete: completeBogoSuffix(tokens, end),
        })
      }
    }
  }
  // Inventory bounded ratio-shaped combinations, not just complete operators.
  // A merged lexeme can contain either operand, so external operands are not
  // required on both sides. These spans are evidence only, never supported.
  const coveredOperators = new Set<number>()
  for (const candidate of candidates) {
    if (candidate.supported)
      for (let index = candidate.start; index < candidate.end; index++)
        if (tokens[index]?.value === 'for') coveredOperators.add(index)
  }
  const operandLike = (token: Token | undefined) =>
    token &&
    (token.kind === 'digits' ||
      (token.kind === 'identifier' && /\p{N}/u.test(token.value)) ||
      token.value.includes('one'))
  // Cache punctuation-run boundaries in two linear passes; a malformed operator
  // must not repeatedly rescan a long adjoining separator run.
  const leftOperands: number[] = []
  const rightOperands: number[] = []
  let previous = -1
  for (let index = 0; index < tokens.length; index++) {
    leftOperands[index] = previous
    if (tokens[index]?.kind !== 'punctuation') previous = index
  }
  let next = tokens.length
  for (let index = tokens.length - 1; index >= 0; index--) {
    rightOperands[index] = next
    if (tokens[index]?.kind !== 'punctuation') next = index
  }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token || coveredOperators.has(index)) continue
    const operator = token.value.indexOf('for')
    if (operator < 0) continue
    const left = leftOperands[index] ?? -1
    const right = rightOperands[index] ?? tokens.length
    const externalLeft = operandLike(tokens[left])
    const externalRight = operandLike(tokens[right])
    const prefix = token.value.slice(0, operator)
    const suffix = token.value.slice(operator + 3)
    const mergedOperand = /(?:^one|one$|\p{N})/u.test(prefix) || /^(?:one|\p{N})/u.test(suffix)
    // Unknown affixes require external ratio context: operands on both sides,
    // or an explicit ratio separator next to one operand. Prose punctuation and
    // words such as "forecast", "before" and "comfort" alone are not offers.
    const ratioSeparator = (separator: Token | undefined) =>
      separator?.kind === 'punctuation' &&
      (!punctuation(separator) || ['-', '–', '—', '/', '\\'].includes(separator.value))
    const separatedOperand =
      (externalLeft && left < index - 1 && ratioSeparator(tokens[index - 1])) ||
      (externalRight && right > index + 1 && ratioSeparator(tokens[index + 1]))
    if (
      mergedOperand ||
      (token.value === 'for' && (externalLeft || externalRight)) ||
      (externalLeft && externalRight) ||
      separatedOperand
    )
      candidates.push({ start: left + 1, end: right, supported: false, complete: false })
  }
  return candidates
}
const secondItemQualification = (tokens: Token[]) => {
  const candidates = scanBogoCandidates(tokens)
  return tokens.some(
    (token, index) =>
      token.value === 'second' ||
      (token.value === '2' && tokens[index + 1]?.value === 'nd') ||
      consumeValues(tokens, index, ['next', 'item']) !== null ||
      consumeValues(tokens, index, ['half', 'price']) !== null ||
      ['paid', 'discounted', 'charge', 'charged', 'pay'].includes(token.value) ||
      ((consumeValues(tokens, index, ['buy', 'one']) !== null ||
        consumeValues(tokens, index, ['get', 'one']) !== null) &&
        !candidates.some((candidate) => index >= candidate.start && index < candidate.end)),
  )
}

export const parseMoneyDigestPost = (input: unknown) => {
  const post = moneyDigestPostSchema.parse(input)
  const fullTitle = plainText(post.title.rendered)
  const title = fullTitle.slice(0, 200)
  const text = plainText(post.content.rendered)
  // Display limits never erase contradictory evidence. Scan each field on its
  // own so a title boundary cannot supply a missing numeric operand/body suffix.
  const fields = [fullTitle, text, plainText(post.excerpt.rendered)].map((source) => ({
    source,
    tokens: lex(source),
  }))
  const evidence = fields.map((field) => field.source).join(' ')
  const food =
    /\b(?:pizza|pasta|burger|chicken|coffee|tea|meal|buffet|sushi|ramen|noodles|rice|dessert|ice cream|food|dining|restaurant|bakery|cake)\b/i.test(
      evidence,
    )
  const bogoCandidates = fields.flatMap((field) => scanBogoCandidates(field.tokens))
  const bogo = bogoCandidates.length > 0
  const incompleteBogo = bogoCandidates.some((candidate) => !candidate.complete)
  const numericCandidates = fields.flatMap((field) =>
    scanNumericCandidates(field.source, field.tokens),
  )
  // These are second-item/unknown-condition offers, not whole-order discounts.
  // This veto covers all evidence, before or after either the offer or validity.
  const qualifiedBogo =
    fields.some((field) => secondItemQualification(field.tokens)) ||
    (bogo && numericCandidates.length > 0)
  const unsupportedNumericExpression =
    numericCandidates.some((candidate) => !candidate.supported) ||
    bogoCandidates.some((candidate) => !candidate.supported) ||
    fields.some((field) =>
      field.tokens.some(
        (token, index) =>
          (token.kind === 'identifier' && /\p{N}/u.test(token.value)) ||
          // A detached exponent letter is still part of unsupported numeric
          // evidence, including when HTML extraction supplied its whitespace.
          (token.value === 'e' && numericAtom(field.tokens[index - 1])),
      ),
    )
  const percentages = numericCandidates.flatMap((candidate) =>
    candidate.kind === 'percent' && candidate.value !== null ? [candidate.value] : [],
  )
  const percent = percentages.length > 0
  const uniquePercentages = [...new Set(percentages)]
  const amounts = [
    ...new Set(
      numericCandidates.flatMap((candidate) =>
        candidate.kind === 'currency' && candidate.value !== null ? [candidate.value] : [],
      ),
    ),
  ]
  const conflictingNumericExpressions = amounts.length > 1 || uniquePercentages.length > 1
  const ambiguousAmount =
    conflictingNumericExpressions ||
    /\b(?:from|starting(?: at)?)\s*(?:S\$|SGD|\$)|\b(?:up to|upto|minimum|spend|save|additional|add-on)\b/i.test(
      evidence,
    )
  const priceMinor =
    !ambiguousAmount &&
    amounts.length === 1 &&
    Number.isSafeInteger(amounts[0]) &&
    (amounts[0] ?? 0) <= 1_000_000
      ? (amounts[0] ?? null)
      : null
  const discountPercent =
    !ambiguousAmount && percent && uniquePercentages.length === 1
      ? (uniquePercentages[0] ?? null)
      : null
  const fixed = numericCandidates.some(
    (candidate) => candidate.kind === 'currency' && candidate.fixed,
  )
  const overseas =
    /\b(?:malaysia|johor|kuala lumpur|thailand|bangkok|indonesia|hong kong|australia|taiwan)\b/i.test(
      evidence,
    )
  if (
    !title ||
    !food ||
    !(bogo || percent || fixed) ||
    unsupportedNumericExpression ||
    (bogo && conflictingNumericExpressions) ||
    qualifiedBogo ||
    overseas ||
    /\b(?:US\$|USD|MYR|RM\s*\d|THB)\b/i.test(evidence)
  )
    return { post, status: 'IGNORED' as const, draft: null }
  const offerType = bogo
    ? ('BUY_ONE_GET_ONE' as const)
    : percent
      ? ('PERCENT_OFF' as const)
      : ('FIXED_PRICE' as const)
  return {
    post,
    status: 'NEEDS_REVIEW' as const,
    draft: {
      title,
      description: text.slice(0, 2000),
      category: 'FOOD',
      offerType,
      priceMinor: offerType === 'FIXED_PRICE' ? priceMinor : null,
      discountPercent: offerType === 'PERCENT_OFF' ? discountPercent : null,
      applicability: 'NO_FIXED_LOCATION' as const,
      terms: null,
      ...parseValidity(text),
      // Unknown BOGO continuations retain a pending evidence-only draft (including
      // extracted description), but cannot borrow known dates to become ready.
      ...(incompleteBogo ? { validFrom: null, validUntil: null } : {}),
    },
  }
}

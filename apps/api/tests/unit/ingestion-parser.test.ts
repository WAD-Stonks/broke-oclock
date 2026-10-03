import { parseMoneyDigestPost } from '@api/modules/ingestion/parser'
import { isReviewReady } from '@api/modules/ingestion/review-policy'
import { describe, expect, it, vi } from 'vitest'

// Entirely synthetic examples; these are not captured/reused publisher articles.
const post = (
  content = '<p>Singapore pizza 1-for-1 promotion. Valid until 31 December 2026.</p>',
) => ({
  id: 101,
  link: 'https://www.moneydigest.sg/synthetic-pizza/',
  date: '2026-10-01T12:00:00',
  title: { rendered: '<b>Synthetic Pizza &amp; Pasta</b>' },
  content: { rendered: content },
  excerpt: { rendered: '' },
})

const validity = 'Valid from 1 October 2026 until 31 December 2026.'
const withValidity = (offer: string) => post(`${offer}. ${validity}`)
const readyAtReviewTime = (parsed: ReturnType<typeof parseMoneyDigestPost>) =>
  parsed.draft
    ? isReviewReady(
        {
          ...parsed.draft,
          sources: [
            {
              sourceContentHash: 'synthetic-current-hash',
              importedPost: { contentHash: 'synthetic-current-hash', errorCode: null },
            },
          ],
        },
        new Date('2026-10-03T00:00:00Z'),
      )
    : false
// Includes literal/decoded NBSP and HTML/newline boundaries before scanning.
const whitespace = ['', ' ', '  ', '\t', '\n', '\u00a0', '&nbsp;', '&#160;', '&#xA0;', '<br>']

describe('MoneyDigest conservative parser', () => {
  it.each([
    'one-forone',
    '1-forone',
    'onefor-1',
    '1-forx',
    // Delete either/both separators; insert malformed separators independently.
    'onefor-one',
    'oneforone',
    '1for-1',
    '1-for1',
    '1for1',
    'one--for-one',
    'one-for--one',
    '1--for-1',
    '1-for--1',
    'one+for-one',
    'one-for+one',
    '1+for-1',
    '1-for+1',
    'one_for-one',
    'one-for_one',
    '1_for-1',
    '1-for_1',
    // Asymmetric merges, missing operands, and junk in the operator/operands.
    'forone',
    'onefor',
    'for1',
    '1for',
    'for-one',
    'one-for',
    'for-1',
    '1-for',
    'one-forx',
    'xfor-one',
    'xfor-1',
    'one-xforx',
    'xforx-one',
    'one-xxforxx',
    'xxforxx-one',
    'forx-one',
    'one-xfor',
    'one-foronex',
    'xonefor-one',
    'oneforx',
    'xforone',
    '1-forone+2',
    'onefor-1e2',
    'one-for-onee2',
    'one-for-one e+2',
    'one-for-one+',
    'one-for-one−',
    'one-for-one+2',
    'one-for-one−2',
    '1-for-1+',
    '1-for-1−',
    '1for-+1',
    '+oneforone',
    'one-<br>forone',
    'onefor&nbsp;-one',
  ])(
    'inventories the entire malformed ratio without fallback or duplicate rescue: "%s"',
    (mutation) => {
      const standalone = withValidity(`Singapore pizza ${mutation}`)
      expect(parseMoneyDigestPost(standalone), mutation).toMatchObject({
        status: 'IGNORED',
        draft: null,
      })
      for (const base of [
        'Singapore pizza 50% off',
        'Singapore pizza promotion S$5.50',
        'Singapore pizza 1-for-1',
      ]) {
        expect(readyAtReviewTime(parseMoneyDigestPost(withValidity(base))), base).toBe(true)
        for (const field of ['title', 'content', 'excerpt'] as const) {
          for (const padding of ['', 'Synthetic text. '.repeat(field === 'title' ? 90 : 140)]) {
            const input = withValidity(base)
            input[field].rendered =
              field === 'content'
                ? `${base}. ${validity} ${padding}${mutation}.`
                : `Synthetic pizza ${padding}${mutation}`
            const parsed = parseMoneyDigestPost(input)
            expect(parsed, `${base}/${field}/${mutation}`).toMatchObject({
              status: 'IGNORED',
              draft: null,
            })
            expect(readyAtReviewTime(parsed)).toBe(false)
            expect(parsed.post).toEqual(input)
            expect(
              parseMoneyDigestPost({
                ...input,
                content: { rendered: `${input.content.rendered} ${base}.` },
              }),
            ).toMatchObject({ status: 'IGNORED', draft: null })
          }
        }
      }
    },
  )
  it.each([
    'before',
    'therefore',
    'comfort',
    'forecast',
    'forward',
    'uniform',
    'information',
    'forage',
  ])('does not inventory ordinary prose containing for as a ratio: "%s"', (word) => {
    expect(parseMoneyDigestPost(withValidity(`Singapore pizza ${word}`))).toMatchObject({
      status: 'IGNORED',
      draft: null,
    })
    for (const field of ['title', 'content', 'excerpt'] as const) {
      for (const gap of [' ', ', ', '. ', ': ']) {
        const input = withValidity('Singapore pizza 50% off')
        input[field].rendered += ` One${gap}${word} available.`
        expect(readyAtReviewTime(parseMoneyDigestPost(input)), field).toBe(true)
      }
    }
  })
  it.each([
    ['1-for-1', 'BUY_ONE_GET_ONE', null, null],
    ['one-for-one', 'BUY_ONE_GET_ONE', null, null],
    ['50% off', 'PERCENT_OFF', null, 50],
    ['promotion S$5.50', 'FIXED_PRICE', 550, null],
  ] as const)(
    'keeps exact %s controls ready in full fields beyond display limits',
    (offer, offerType, priceMinor, discountPercent) => {
      for (const field of ['title', 'content', 'excerpt'] as const) {
        for (const padding of ['', 'Synthetic text. '.repeat(field === 'title' ? 90 : 140)]) {
          const input = post(`Singapore pizza. ${validity}`)
          input[field].rendered =
            `${padding}Singapore pizza ${offer}${field === 'content' ? `. ${validity}` : ''}`
          const parsed = parseMoneyDigestPost(input)
          expect(parsed.post).toEqual(input)
          expect(parsed.draft).toMatchObject({ offerType, priceMinor, discountPercent })
          expect(readyAtReviewTime(parsed), field).toBe(true)
        }
      }
    },
  )
  it('bounds currency split validation work on schema-bounded adversarial input', () => {
    const input = withValidity(`Singapore pizza promotion S$${'1 '.repeat(49_900)}50% off`)
    expect(input.content.rendered.length).toBeLessThanOrEqual(100_000)
    let inspectedCharacters = 0
    const originalTest = RegExp.prototype.test
    const spy = vi.spyOn(RegExp.prototype, 'test').mockImplementation(function (
      this: RegExp,
      value: string,
    ) {
      if (this.source === '^\\d+\\.\\d{2}$') inspectedCharacters += value.length
      return originalTest.call(this, value)
    })
    try {
      expect(readyAtReviewTime(parseMoneyDigestPost(input))).toBe(false)
    } finally {
      spy.mockRestore()
    }
    // Operation budget, not a hardware-dependent millisecond assertion.
    expect(inspectedCharacters).toBeLessThanOrEqual(input.content.rendered.length * 4)
  })
  it.each([
    'Singapore pizza 50% off or xSGD5.500 only',
    'Singapore pizza promotion S$5.50 or xSGD6.50 only',
    'Singapore pizza 1e1-for-1',
    'Singapore pizza 0.1-for-1',
    'Singapore pizza 50% off2.50',
    'Singapore pizza 50% off or 2e 50 % off',
  ])('rejects the complete lexical-boundary reproduction "%s"', (offer) => {
    const input = withValidity(offer)
    const parsed = parseMoneyDigestPost(input)
    expect(parsed.post).toEqual(input)
    expect(readyAtReviewTime(parsed)).toBe(false)
    expect(parsed).toMatchObject({ status: 'IGNORED', draft: null })
  })
  it.each(['+one-for-one', '-one-for-one', '−one-for-one', '＋one-for-one'])(
    'rejects a signed word-form BOGO operand instead of rescuing one: "%s"',
    (phrase) => {
      expect(parseMoneyDigestPost(withValidity(`Singapore pizza ${phrase}`))).toMatchObject({
        status: 'IGNORED',
        draft: null,
      })
    },
  )
  it.each([
    '+1-for-1',
    '-1-for-1',
    '−1-for-1',
    '＋1-for-1',
    '0.1-for-1',
    '1.0-for-1',
    '1e1-for-1',
    '1 e 1-for-1',
    '1-for-+1',
    '1-for--1',
    '1-for-−1',
    '1-for-＋1',
    '1-for-0.1',
    '1-for-1.0',
    '1-for-1e1',
    '1-for-1 e 1',
    'x1-for-1',
    '1-for-1x',
    'one-for-onex',
    'xone-for-one',
    '1-forx-1',
    '1-xfor-1',
    'buy one get onex',
    'buyx one get one',
  ])('retains malformed BOGO operands/operators as whole-evidence veto: "%s"', (mutation) => {
    const standalone = parseMoneyDigestPost(withValidity(`Singapore pizza ${mutation}`))
    expect(readyAtReviewTime(standalone), mutation).toBe(false)
    expect(standalone, mutation).toMatchObject({ status: 'IGNORED', draft: null })
    for (const field of ['title', 'content', 'excerpt'] as const) {
      const base = 'Singapore pizza 50% off'
      expect(readyAtReviewTime(parseMoneyDigestPost(withValidity(base)))).toBe(true)
      const input = withValidity(base)
      input[field].rendered =
        field === 'content' ? `${base} or ${mutation}. ${validity}` : `Synthetic pizza ${mutation}`
      const parsed = parseMoneyDigestPost(input)
      expect(readyAtReviewTime(parsed), `${field}: ${mutation}`).toBe(false)
      expect(parsed, `${field}: ${mutation}`).toMatchObject({ status: 'IGNORED', draft: null })
      expect(parsed.post).toEqual(input)
      const duplicated = { ...input, content: { rendered: `${input.content.rendered} ${base}.` } }
      expect(readyAtReviewTime(parseMoneyDigestPost(duplicated)), `${field}: duplicate`).toBe(false)
    }
  })
  it.each([
    'xSGD5.500',
    'xSGD6.50',
    '5SGD6.50',
    'SGDx6.50',
    'SGD6.50x',
    'abcSGDxyz',
    'xS$6.50',
    '5S$6.50',
    'S$6.50x',
    'x$6.50',
    '$6.50x',
    'SGD6.50_only',
  ])('retains every embedded currency marker as invalid evidence: "%s"', (mutation) => {
    for (const field of ['title', 'content', 'excerpt'] as const) {
      for (const base of ['Singapore pizza 50% off', 'Singapore pizza promotion S$5.50']) {
        const input = withValidity(base)
        input[field].rendered =
          field === 'content'
            ? `${base} or ${mutation} only. ${validity}`
            : `Synthetic pizza ${mutation} only`
        const parsed = parseMoneyDigestPost(input)
        expect(readyAtReviewTime(parsed), `${field}: ${mutation}`).toBe(false)
        expect(parsed).toMatchObject({ status: 'IGNORED', draft: null })
        expect(parsed.post).toEqual(input)
      }
    }
  })
  it.each([
    'off2.50',
    'off.2.50',
    'off+2',
    'off−2',
    'off.2e50',
    'offx',
    'off_2',
    'xoff',
    'discount2',
    'discountx',
    'xdiscount',
    'offSGD',
  ])('validates both boundaries of the complete percentage operator: "%s"', (operator) => {
    for (const field of ['title', 'content', 'excerpt'] as const) {
      const input = withValidity('Singapore pizza 50% off')
      const mutation = `50% ${operator}`
      input[field].rendered =
        field === 'content' ? `Singapore pizza 50% off or ${mutation}. ${validity}` : mutation
      expect(parseMoneyDigestPost(input)).toMatchObject({ status: 'IGNORED', draft: null })
    }
  })
  it.each(
    [' ', '\n', '&nbsp;', '&#160;', '<br>', '<em> </em>'].flatMap((gap) =>
      [`2e${gap}50`, `2${gap}e${gap}50`, `2${gap}E${gap}+50`, `2${gap}e-${gap}50`].map(
        (amount) => ({ gap, amount }),
      ),
    ),
  )('rejects exponent quantities across whitespace/HTML in every field: $amount', ({ amount }) => {
    for (const field of ['title', 'content', 'excerpt'] as const) {
      for (const mutation of [`${amount} % off`, `SGD${amount} only`, `${amount}-for-1`]) {
        const input = withValidity('Singapore pizza 50% off')
        input[field].rendered =
          field === 'content' ? `Singapore pizza 50% off or ${mutation}. ${validity}` : mutation
        expect(parseMoneyDigestPost(input), `${field}: ${mutation}`).toMatchObject({
          status: 'IGNORED',
          draft: null,
        })
      }
    }
  })
  it.each(['25.', '25..', '25,'])(
    'rejects a complete trailing-separator percentage candidate "%s"',
    (amount) => {
      const parsed = parseMoneyDigestPost(
        withValidity(
          `Singapore pizza 50% off or ${amount} % ${amount === '25,' ? 'discount' : 'off'}`,
        ),
      )
      expect(readyAtReviewTime(parsed)).toBe(false)
      expect(parsed).toMatchObject({ status: 'IGNORED', draft: null })
    },
  )
  it('consumes the entire BOGO continuation, not just a validity prefix', () => {
    const parsed = parseMoneyDigestPost(
      post(`Singapore chicken buy one, get one. ${validity} Second item at half price.`),
    )
    expect(readyAtReviewTime(parsed)).toBe(false)
    expect(parsed).toMatchObject({ status: 'IGNORED', draft: null })
  })
  it.each([
    '25.',
    '25..',
    '25,',
    '25,,',
    '.25',
    ',25',
    '2.50',
    '2,50',
    '2 . 50',
    '2 50',
    '2\u00a050',
    '25 .',
    '25 ,',
    '+25',
    '-25',
    '−25',
    '＋25',
    '2·50',
    '2?50',
    '2/50',
    '2e1',
    '0',
    '101',
    '25 percent',
  ])('never rescues a ready offer by discarding malformed numeric evidence "%s"', (amount) => {
    for (const base of [
      'Singapore pizza 50% off',
      'Singapore pizza promotion S$5.50',
      'Singapore chicken buy one, get one free',
    ]) {
      expect(readyAtReviewTime(parseMoneyDigestPost(withValidity(base))), base).toBe(true)
      const mutation = `${amount}${amount.endsWith('percent') ? '' : ' %'} off`
      for (const content of [
        `${base} or ${mutation}. ${validity}`,
        `${mutation}. ${base}. ${validity}`,
        `${base}. ${validity} Or ${mutation}.`,
      ]) {
        const parsed = parseMoneyDigestPost(post(content))
        expect(readyAtReviewTime(parsed), content).toBe(false)
        // Appending an exact supported duplicate cannot restore lost readiness.
        expect(readyAtReviewTime(parseMoneyDigestPost(post(`${content} ${base}.`))), content).toBe(
          false,
        )
      }
    }
  })
  it.each(['S$999999999999999999999.99', 'S$5 50% off', 'S$5 50 % off'])(
    'keeps out-of-range or ambiguous numeric candidates unready: "%s"',
    (amount) => {
      const content = `Singapore pizza 50% off or ${amount} only. ${validity}`
      expect(readyAtReviewTime(parseMoneyDigestPost(post(content)))).toBe(false)
    },
  )
  it.each(['S$5.', 'SGD5.', '$5.'])(
    'does not erase an ambiguous trailing currency separator before validity: "%s"',
    (amount) => {
      expect(
        readyAtReviewTime(
          parseMoneyDigestPost(post(`Singapore pizza 50% off or ${amount} ${validity}`)),
        ),
      ).toBe(false)
    },
  )
  it.each(['-S$5.50', '+ S$5.50', '−SGD5.50', '＋$5.50', 'xS$5.50', '5S$5.50'])(
    'retains unsupported currency prefixes as part of the candidate: "%s"',
    (amount) => {
      const content = `Singapore pizza 50% off or ${amount} only. ${validity}`
      expect(readyAtReviewTime(parseMoneyDigestPost(post(content)))).toBe(false)
    },
  )
  it.each([
    'buy one + get one 50% off',
    'buy one/get one 50% off',
    'buy one get two 50% off',
    'get one 50% off',
    'buy one + get one. Valid from 1 October 2026 until 31 December 2026.',
  ])(
    'does not fall back from an unsupported second-item grammar to a ready offer: "%s"',
    (phrase) => {
      const parsed = parseMoneyDigestPost(post(`Singapore chicken 50% off. ${phrase}. ${validity}`))
      expect(readyAtReviewTime(parsed)).toBe(false)
    },
  )
  it.each([
    'S$5.',
    'S$5..',
    'S$5,',
    'S$5,,50',
    'S$.50',
    'S$5.5',
    'S$5.500',
    'S$5 50',
    'S$5 . 50',
    'S$+5.50',
    'S$−5.50',
    'S$＋5.50',
    'S$5e2',
    'S$5·50',
  ])('never rescues a ready offer with malformed monetary evidence "%s"', (amount) => {
    for (const base of ['Singapore pizza 50% off', 'Singapore pizza promotion S$5.50']) {
      expect(readyAtReviewTime(parseMoneyDigestPost(withValidity(base)))).toBe(true)
      for (const content of [
        `${base} or ${amount} only. ${validity}`,
        `${amount} only. ${base}. ${validity}`,
        `${base}. ${validity} Or ${amount} only.`,
      ])
        expect(readyAtReviewTime(parseMoneyDigestPost(post(content))), content).toBe(false)
    }
  })
  it.each([
    'Second item at half price.',
    'Second item 50% off.',
    'Second item for S$5.50.',
    'Second item has additional conditions.',
    '2nd item at half price.',
    'Next item discounted.',
    'Half price on the next chicken.',
  ])(
    'rejects second-item evidence anywhere, including title/body/excerpt: "%s"',
    (qualification) => {
      for (const phrase of ['buy one, get one', 'buy one get one free', '1-for-1', 'one-for-one']) {
        const base = `Singapore chicken ${phrase}`
        expect(readyAtReviewTime(parseMoneyDigestPost(withValidity(base)))).toBe(true)
        for (const content of [
          `${base}. ${qualification} ${validity}`,
          `${base}. ${validity} ${qualification}`,
          `${qualification} ${base}. ${validity}`,
        ])
          expect(parseMoneyDigestPost(post(content)), content).toMatchObject({
            status: 'IGNORED',
            draft: null,
          })
        for (const field of ['title', 'excerpt'] as const) {
          expect(
            parseMoneyDigestPost({ ...withValidity(base), [field]: { rendered: qualification } }),
          ).toMatchObject({ status: 'IGNORED', draft: null })
        }
      }
    },
  )
  it.each(['Additional conditions apply.', 'Members only.', 'Available at selected stores.'])(
    'does not treat an unknown post-validity continuation as fully consumed: "%s"',
    (suffix) => {
      const content = `Singapore chicken buy one, get one. ${validity} ${suffix}`
      expect(readyAtReviewTime(parseMoneyDigestPost(post(content)))).toBe(false)
    },
  )
  it('inspects source evidence beyond display truncation without rewriting the post', () => {
    for (const field of ['title', 'content', 'excerpt'] as const) {
      const original = {
        ...withValidity('Singapore pizza 50% off'),
        [field]: {
          rendered: `${'Synthetic text. '.repeat(field === 'title' ? 90 : 140)} 25. % off. ${validity}`,
        },
      }
      const parsed = parseMoneyDigestPost(original)
      expect(parsed.post).toEqual(original)
      expect(readyAtReviewTime(parsed), field).toBe(false)
    }
  })
  it.each([
    ['Singapore pizza 50% off', '25% off'],
    ['Singapore pizza promotion S$5.50', 'S$6.50 only'],
    ['Singapore chicken 1-for-1', 'Second item 50% off'],
  ])('adding conflicting evidence cannot preserve or restore readiness: "%s"', (base, conflict) => {
    expect(readyAtReviewTime(parseMoneyDigestPost(withValidity(base)))).toBe(true)
    const mutated = `${base}. ${validity} Or ${conflict}.`
    expect(readyAtReviewTime(parseMoneyDigestPost(post(mutated)))).toBe(false)
    expect(readyAtReviewTime(parseMoneyDigestPost(post(`${mutated} ${base}.`)))).toBe(false)
  })
  it.each([
    ['Singapore pizza S$5 only', 500],
    ['Singapore pizza promotion SGD5 only', 500],
    ['Singapore pizza promotion $0.29 only', 29],
    ['Singapore pizza promotion S$10000.00 only', 1_000_000],
  ])('keeps exact supported currency controls without rounding: "%s"', (offer, amount) => {
    const parsed = parseMoneyDigestPost(withValidity(String(offer)))
    expect(parsed.draft).toMatchObject({ offerType: 'FIXED_PRICE', priceMinor: amount })
    expect(readyAtReviewTime(parsed)).toBe(true)
  })
  it.each(['Singapore pizza promotion S$5.50 50% off', 'Singapore pizza 50% off promotion S$5.50'])(
    'keeps adjacent price and percentage candidates distinct: "%s"',
    (offer) => {
      expect(readyAtReviewTime(parseMoneyDigestPost(withValidity(offer)))).toBe(true)
      expect(parseMoneyDigestPost(withValidity(offer)).draft).toMatchObject({
        offerType: 'PERCENT_OFF',
        discountPercent: 50,
        priceMinor: null,
      })
    },
  )
  it.each([
    'Singapore pizza promotion S$5.50 or S$ 6.5',
    'Singapore pizza promotion S$5.50 or S$ 6.50',
  ])('blocks the spaced currency bypass "%s"', (offer) => {
    const parsed = parseMoneyDigestPost(withValidity(offer))
    expect(readyAtReviewTime(parsed)).toBe(false)
    if (offer.endsWith('6.5')) expect(parsed).toMatchObject({ status: 'IGNORED', draft: null })
    else
      expect(parsed.draft).toMatchObject({
        offerType: 'FIXED_PRICE',
        priceMinor: null,
        discountPercent: null,
      })
  })
  it.each(
    ['S$', 'SGD', '$'].flatMap((currency) =>
      whitespace.flatMap((gap) =>
        ['6.5', '6.50', '6.500', '6,50', '6 . 50'].map((amount) => ({ currency, gap, amount })),
      ),
    ),
  )(
    'scans whole currency expressions across $currency/$gap/$amount',
    ({ currency, gap, amount }) => {
      for (const context of ['promotion', '50% off promotion', '1-for-1 promotion']) {
        const offer = `Singapore pizza ${context} ${currency}5.50 or ${currency}${gap}${amount}`
        const parsed = parseMoneyDigestPost(withValidity(offer))
        expect(readyAtReviewTime(parsed), offer).toBe(false)
        if (amount !== '6.50' || context === '1-for-1 promotion')
          expect(parsed, offer).toMatchObject({ status: 'IGNORED', draft: null })
        else expect(parsed.draft, offer).toMatchObject({ priceMinor: null, discountPercent: null })
      }
    },
  )
  it.each(['S$', 'SGD', '$'].flatMap((currency) => whitespace.map((gap) => ({ currency, gap }))))(
    'preserves an unambiguous known-valid currency offer across $currency/$gap',
    ({ currency, gap }) => {
      for (const offer of [
        `Singapore pizza promotion ${currency}${gap}5.50`,
        `Singapore pizza ${currency}${gap}5.50 only`,
        `Singapore pizza promotion ${currency}5.50 or ${currency}${gap}5.50`,
      ]) {
        const parsed = parseMoneyDigestPost(withValidity(offer))
        expect(parsed.draft, offer).toMatchObject({
          offerType: 'FIXED_PRICE',
          priceMinor: 550,
          discountPercent: null,
        })
        expect(readyAtReviewTime(parsed), offer).toBe(true)
      }
    },
  )
  it('blocks the spaced percentage bypass without approving the first percentage', () => {
    const parsed = parseMoneyDigestPost(withValidity('Singapore pizza 50% off or 2.50 % off'))
    expect(parsed).toMatchObject({ status: 'IGNORED', draft: null })
    expect(readyAtReviewTime(parsed)).toBe(false)
  })
  it.each(
    whitespace.flatMap((gap) =>
      ['off', 'discount'].flatMap((keyword) =>
        ['2.50', '2,50', '2 . 50', '2. 50', '2.50.25', '25'].map((amount) => ({
          gap,
          keyword,
          amount,
        })),
      ),
    ),
  )(
    'scans whole percentage expressions across $amount/$gap/$keyword',
    ({ gap, keyword, amount }) => {
      for (const context of ['', 'promotion S$5.50 ', '1-for-1 ']) {
        const offer = `Singapore pizza ${context}50% off or ${amount}${gap}% ${keyword}`
        const parsed = parseMoneyDigestPost(withValidity(offer))
        expect(readyAtReviewTime(parsed), offer).toBe(false)
        if (amount !== '25' || context === '1-for-1 ')
          expect(parsed, offer).toMatchObject({ status: 'IGNORED', draft: null })
        else
          expect(parsed.draft, offer).toMatchObject({
            offerType: 'PERCENT_OFF',
            priceMinor: null,
            discountPercent: null,
          })
      }
    },
  )
  it.each(whitespace.flatMap((gap) => ['off', 'discount'].map((keyword) => ({ gap, keyword }))))(
    'preserves an unambiguous known-valid percentage across $gap/$keyword',
    ({ gap, keyword }) => {
      for (const offer of [
        `Singapore pizza 50${gap}% ${keyword}`,
        `Singapore pizza 50% off or 50${gap}% ${keyword}`,
      ]) {
        const parsed = parseMoneyDigestPost(withValidity(offer))
        expect(parsed.draft, offer).toMatchObject({
          offerType: 'PERCENT_OFF',
          discountPercent: 50,
          priceMinor: null,
        })
        expect(readyAtReviewTime(parsed), offer).toBe(true)
      }
    },
  )
  it('blocks the comma-separated qualified BOGO bypass', () => {
    const parsed = parseMoneyDigestPost(withValidity('Singapore chicken buy one, get one 50% off'))
    expect(parsed).toMatchObject({ status: 'IGNORED', draft: null })
    expect(readyAtReviewTime(parsed)).toBe(false)
  })
  it.each(
    [
      ' ',
      ', ',
      ',\n',
      '; ',
      ': ',
      ' - ',
      ' – ',
      ' — ',
      '. ',
      '! ',
      '? ',
      ' (',
      ') ',
      '\n',
      '<br>',
      '&nbsp;',
      '&#160;',
    ].flatMap((separator) =>
      ['50% off', '50 % off', 'at half price', 'for S$ 5.50 only'].map((qualifier) => ({
        separator,
        qualifier,
      })),
    ),
  )(
    'rejects qualified second-item offers across $separator/$qualifier',
    ({ separator, qualifier }) => {
      for (const suffix of [
        ' ',
        ', ',
        ': ',
        '; ',
        ' - ',
        ' — ',
        '. ',
        '! ',
        '? ',
        '\n',
        '<br>',
        '&nbsp;',
      ]) {
        for (const phrase of [
          `buy one${separator}get one`,
          `buy${separator}one get${separator}one`,
        ]) {
          const offer = `Singapore chicken ${phrase}${suffix}${qualifier}`
          const parsed = parseMoneyDigestPost(withValidity(offer))
          expect(parsed, offer).toMatchObject({ status: 'IGNORED', draft: null })
          expect(readyAtReviewTime(parsed), offer).toBe(false)
        }
      }
    },
  )
  it.each([
    '1-for-1',
    '1 for 1',
    'one-for-one',
    'one for one',
    'buy one get one',
    'buy one get one free',
    'buy one, get one',
    'buy one, get one free',
    'buy one; get one free',
    'buy one — get one free',
    'buy one\nget one free',
    'buy one<br>get one free',
    'buy&nbsp;one, get&#160;one free',
  ])('preserves an unambiguous known-valid BOGO "%s"', (phrase) => {
    const parsed = parseMoneyDigestPost(withValidity(`Singapore chicken ${phrase}`))
    expect(parsed.draft).toMatchObject({
      offerType: 'BUY_ONE_GET_ONE',
      priceMinor: null,
      discountPercent: null,
    })
    expect(readyAtReviewTime(parsed)).toBe(true)
  })
  it.each([
    'Singapore pizza 50% off,25 % off',
    'Singapore pizza 50% off;2.50 % off',
    'Singapore pizza 50% off or .50 % off',
    'Singapore pizza 50% off or 2..50 % off',
    'Singapore pizza 50% off or 2 50 % off',
    'Singapore pizza 50% off or -50 % off',
    'Singapore pizza promotion S$5.50 or S$ -5.50',
    'Singapore pizza promotion S$5.50 or S$ .50',
    'Singapore pizza promotion S$5 or S$ 5..50',
    'Singapore pizza promotion S$5 or S$ 5 50',
  ])('does not discard a punctuation-delimited or unsupported numeric token "%s"', (offer) => {
    const parsed = parseMoneyDigestPost(withValidity(offer))
    expect(readyAtReviewTime(parsed)).toBe(false)
    if (parsed.draft)
      expect(parsed.draft).toMatchObject({ priceMinor: null, discountPercent: null })
  })
  it('ignores non-offers, non-food and overseas posts', () => {
    for (const text of [
      'Singapore pizza restaurant opening news',
      'Singapore laptop 50% off',
      'Malaysia pizza 1-for-1 promotion',
    ]) {
      expect(
        parseMoneyDigestPost({ ...post(text), title: { rendered: 'Synthetic article' } }).status,
      ).toBe('IGNORED')
    }
  })
  it('removes executable content and decodes entities without treating decoded tags as HTML', () => {
    const parsed = parseMoneyDigestPost(
      post(
        '<script>secret()</script><style>hidden</style><p>Singapore pizza &#49;-for-1 &quot;promotion&quot; &lt;b&gt;safe&lt;/b&gt;</p>',
      ),
    )
    expect(parsed.draft?.description).toBe('Singapore pizza 1-for-1 "promotion" <b>safe</b>')
  })
  it('keeps ambiguous or invalid validity unknown without guessing a year', () => {
    for (const text of [
      'Valid until 31 December',
      'Valid until 31 February 2026',
      'Valid until 31 December 2026 or while stocks last',
      'Valid from 31 December 2026 until 1 January 2026',
      'Valid until 31 December 2026. Valid until 30 November 2026',
    ]) {
      const parsed = parseMoneyDigestPost(post(`Singapore pizza 50% off. ${text}.`))
      expect(parsed.draft?.validUntil).toBeNull()
      expect(parsed.draft?.rawValidityText).toContain(text)
      expect(parsed.draft?.offerType).toBe('PERCENT_OFF')
    }
  })
  it('retains conservative explicit price and percent amounts and rejects impossible percentages', () => {
    expect(
      parseMoneyDigestPost(post('Singapore pizza promotion S$5.50. Valid until 31 December 2026.'))
        .draft,
    ).toMatchObject({ offerType: 'FIXED_PRICE', priceMinor: 550, discountPercent: null })
    expect(
      parseMoneyDigestPost(post('Singapore pizza 50% off. Valid until 31 December 2026.')).draft,
    ).toMatchObject({ discountPercent: 50, priceMinor: null })
    expect(parseMoneyDigestPost(post('Singapore pizza 150% off.')).status).toBe('IGNORED')
    expect(
      parseMoneyDigestPost(post('Singapore pizza promotion S$5.50 or S$6.50.')).draft?.priceMinor,
    ).toBeNull()
    expect(parseMoneyDigestPost(post('Singapore pizza promotion US$5.50.')).status).toBe('IGNORED')
    expect(
      parseMoneyDigestPost(post('Singapore pizza promotion from S$5.50 only.')).draft?.priceMinor,
    ).toBeNull()
    expect(
      parseMoneyDigestPost(post('Singapore pizza up to 50% off.')).draft?.discountPercent,
    ).toBeNull()
  })
  it.each([
    ['decimal percentage', 'Singapore pizza 2.50% off'],
    ['unsupported conflicting price', 'Singapore pizza promotion S$5.50 or S$6.5'],
    [
      'conflicting prices alongside a percentage',
      'Singapore pizza 50% off promotion S$5.50 or S$6.50',
    ],
    ['conflicting prices alongside BOGO', 'Singapore pizza 1-for-1 promotion S$5.50 or S$6.50'],
  ])('keeps %s numeric expressions unready without matching a numeric fragment', (_, offer) => {
    const parsed = parseMoneyDigestPost(
      post(`${offer}. Valid from 1 October 2026 until 31 December 2026.`),
    )
    const ready = parsed.draft
      ? isReviewReady(
          {
            ...parsed.draft,
            sources: [
              {
                sourceContentHash: 'synthetic-current-hash',
                importedPost: { contentHash: 'synthetic-current-hash', errorCode: null },
              },
            ],
          },
          new Date('2026-10-03T00:00:00Z'),
        )
      : false
    expect(ready).toBe(false)
    if (parsed.draft) {
      expect(parsed.draft.priceMinor).toBeNull()
      expect(parsed.draft.discountPercent).toBeNull()
    }
  })
  it.each([
    'Singapore chicken buy one get one at half price',
    'Singapore chicken buy one get one 50% off',
  ])('does not publish an unqualified BOGO draft for "%s"', (offer) => {
    const parsed = parseMoneyDigestPost(
      post(`${offer}. Valid from 1 October 2026 until 31 December 2026.`),
    )
    // These second-item offers are outside the deliberately narrow BOGO grammar.
    // Ignoring them avoids both a false free-item BOGO and a whole-order percent offer.
    expect(parsed).toMatchObject({ status: 'IGNORED', draft: null })
  })
  it('does not mistake an explicit validity start for a variable offer price', () => {
    expect(
      parseMoneyDigestPost(
        post('Singapore pizza promotion S$5.50. Valid from 1 October 2026 until 31 December 2026.'),
      ).draft,
    ).toMatchObject({ priceMinor: 550, validFrom: new Date('2026-09-30T16:00:00Z') })
    expect(
      parseMoneyDigestPost(
        post('Singapore pizza 50% off. Valid from 1 October 2026 until 31 December 2026.'),
      ).draft?.discountPercent,
    ).toBe(50)
  })
  it('rejects oversized content, malformed identity and off-host URLs', () => {
    for (const input of [
      { ...post(), id: 0 },
      { ...post(), link: 'https://evil.test/' },
      post('x'.repeat(100_001)),
    ]) {
      expect(() => parseMoneyDigestPost(input)).toThrow()
    }
  })
  it('extracts a plain pending draft with an exclusive Singapore date-only end', () => {
    const parsed = parseMoneyDigestPost(post())
    expect(parsed.status).toBe('NEEDS_REVIEW')
    expect(parsed.draft).toMatchObject({
      title: 'Synthetic Pizza & Pasta',
      category: 'FOOD',
      offerType: 'BUY_ONE_GET_ONE',
      applicability: 'NO_FIXED_LOCATION',
      validUntil: new Date('2026-12-31T16:00:00.000Z'),
      rawValidityText: 'Valid until 31 December 2026',
    })
    expect(parsed.draft?.description).not.toContain('<')
  })
})

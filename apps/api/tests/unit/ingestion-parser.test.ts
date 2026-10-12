import { createHash } from 'node:crypto'
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
const evidenceHash = (input: ReturnType<typeof parseMoneyDigestPost>['post']) =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex')
const expectIgnoredWithOriginalEvidence = (input: ReturnType<typeof post>, scenario: string) => {
  const original = JSON.stringify(input)
  const originalHash = evidenceHash(input)
  const parsed = parseMoneyDigestPost(input)
  expect(JSON.stringify(input), scenario).toBe(original)
  expect(parsed.post, scenario).toEqual(input)
  expect(evidenceHash(parsed.post), scenario).toBe(originalHash)
  expect(parsed, scenario).toMatchObject({ status: 'IGNORED', draft: null })
  expect(readyAtReviewTime(parsed), scenario).toBe(false)
}
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
const expectNoOfferRescue = (mutation: string, titlePaddingRepeats = 90) => {
  expectIgnoredWithOriginalEvidence(withValidity(`Singapore pizza ${mutation}`), 'standalone')
  for (const base of [
    'Singapore pizza 50% off',
    'Singapore pizza promotion S$5.50',
    'Singapore pizza 1-for-1',
    'Singapore pizza buy one get one free',
  ]) {
    expect(readyAtReviewTime(parseMoneyDigestPost(withValidity(base))), base).toBe(true)
    for (const field of ['title', 'content', 'excerpt'] as const) {
      for (const padding of [
        '',
        'Synthetic text. '.repeat(field === 'title' ? titlePaddingRepeats : 140),
      ]) {
        for (const placement of ['before', 'after'] as const) {
          const input = withValidity(base)
          const evidence = `${padding}${mutation}.`
          input[field].rendered =
            placement === 'before'
              ? `${evidence} ${input[field].rendered}`
              : `${input[field].rendered} ${evidence}`
          expectIgnoredWithOriginalEvidence(input, `${base}/${field}/${placement}`)
          expectIgnoredWithOriginalEvidence(
            { ...input, content: { rendered: `${input.content.rendered} ${base}.` } },
            `${base}/${field}/${placement}/duplicate`,
          )
        }
      }
    }
  }
}
// Includes literal/decoded NBSP and HTML/newline boundaries before scanning.
const whitespace = ['', ' ', '  ', '\t', '\n', '\u00a0', '&nbsp;', '&#160;', '&#xA0;', '<br>']

describe('MoneyDigest conservative parser', () => {
  it('characterizes frontier field boundaries without borrowing paired context', () => {
    for (const [left, right] of [
      ['_buy1 ....', '.... _get1 free'],
      ['_2nd ....', '.... item'],
    ]) {
      const input = withValidity('Singapore pizza 50% off')
      input.title.rendered += ` ${left}`
      input.excerpt.rendered = right
      const parsed = parseMoneyDigestPost(input)
      expect(parsed.draft).toMatchObject({
        offerType: 'PERCENT_OFF',
        priceMinor: null,
        discountPercent: 50,
      })
      expect(readyAtReviewTime(parsed)).toBe(true)
      expect(evidenceHash(parsed.post)).toBe(evidenceHash(input))
    }
  })
  it('characterizes linear punctuation inventory work on schema-bounded frontier input', () => {
    const input = withValidity(`Singapore pizza _buy1 ${'.'.repeat(90_000)} and _get1 free`)
    expect(input.content.rendered.length).toBeLessThanOrEqual(100_000)
    let punctuationChecks = 0
    const originalTest = RegExp.prototype.test
    const spy = vi.spyOn(RegExp.prototype, 'test').mockImplementation(function (
      this: RegExp,
      value: string,
    ) {
      if (this.source === '^\\p{P}$') punctuationChecks++
      return originalTest.call(this, value)
    })
    try {
      expect(readyAtReviewTime(parseMoneyDigestPost(input))).toBe(false)
    } finally {
      spy.mockRestore()
    }
    expect(punctuationChecks).toBeGreaterThan(90_000)
    expect(punctuationChecks).toBeLessThanOrEqual(input.content.rendered.length * 20)
  })
  it.each([
    '25per_cent off',
    '25per__cent off',
    '25p_e_r_c_e_n_t off',
    '25per\u0301cent off',
    '25p\u0301er_cen\u0301t off',
    '25per_centage off',
    'per_cent25 off',
    '_per_cent25 discount',
    'per_cent off',
    'per_centage discount',
    'per\u0301cent off',
    '25per&#95;cent off',
    '<b>25per_cent</b><br>off',
    '25per_cent\noff',
    '25per_cent .... off',
    '25percentage off',
    'percent25 off',
  ])(
    'vetoes frontier percent word markers without supported suffix or duplicate rescue: "%s"',
    (mutation) => {
      expectNoOfferRescue(mutation)
    },
  )
  it.each(['title', 'content', 'excerpt'] as const)(
    'keeps frontier percent symbol controls and named-product evidence-only grammar in %s',
    (field) => {
      for (const amount of [1, 25, 50, 100]) {
        const parsed = parseMoneyDigestPost(withValidity(`Singapore pizza ${amount}% off`))
        expect(parsed.draft).toMatchObject({
          offerType: 'PERCENT_OFF',
          priceMinor: null,
          discountPercent: amount,
        })
        expect(readyAtReviewTime(parsed)).toBe(true)
      }
      for (let words = 1; words <= 8; words++) {
        const input = withValidity('Singapore pizza 1-for-1')
        input[field].rendered =
          `Buy one ${'vanilla '.repeat(words)}and get another free. ${input[field].rendered}`
        const originalHash = evidenceHash(input)
        const parsed = parseMoneyDigestPost(input)
        expect(evidenceHash(parsed.post)).toBe(originalHash)
        expect(parsed.status).toBe('NEEDS_REVIEW')
        expect(parsed.draft).toMatchObject({
          offerType: 'BUY_ONE_GET_ONE',
          priceMinor: null,
          discountPercent: null,
          validFrom: null,
          validUntil: null,
        })
        expect(parsed.draft?.rawValidityText).toContain('Valid from 1 October 2026')
        expect(readyAtReviewTime(parsed)).toBe(false)
      }
    },
  )
  it.each([
    '_2nd .... item requires membership',
    'item .... _2nd requires membership',
    ...[0, 1, 3, 4, 5, 16, 512].flatMap((count) => [
      `x2n_d ${'—'.repeat(count)} items requires membership`,
      `items ${','.repeat(count)} x2n_d requires membership`,
    ]),
    '_2nd<br>....<b>item</b> requires membership',
    'item\n....<i>_2nd</i> requires membership',
    'x2n\u0301d .... item requires membership',
    'item .... x2n\u0301d requires membership',
  ])(
    'vetoes frontier ordinal/item qualifiers in both directions without duplicate rescue: "%s"',
    (mutation) => {
      expectNoOfferRescue(mutation, 40)
    },
  )
  it.each([
    'Part _2nd .... warehouse item.',
    'Part item .... warehouse _2nd.',
    'Brand 22ndStreet chicken.',
  ])('keeps frontier ordinal metadata with exact supported amounts: "%s"', (metadata) => {
    for (const [offer, offerType, priceMinor, discountPercent] of [
      ['50% off', 'PERCENT_OFF', null, 50],
      ['promotion S$5.50', 'FIXED_PRICE', 550, null],
      ['1-for-1', 'BUY_ONE_GET_ONE', null, null],
    ] as const) {
      for (const field of ['title', 'content', 'excerpt'] as const) {
        const input = withValidity(`Singapore pizza ${offer}`)
        input[field].rendered = `${metadata} ${input[field].rendered}`
        const originalHash = evidenceHash(input)
        const parsed = parseMoneyDigestPost(input)
        expect(evidenceHash(parsed.post)).toBe(originalHash)
        expect(parsed.draft).toMatchObject({ offerType, priceMinor, discountPercent })
        expect(readyAtReviewTime(parsed), `${offer}/${field}`).toBe(true)
      }
    }
  })
  it.each([
    '_buy1 .... _get1 free',
    'xbuy1 and xget1 free',
    ...[0, 1, 3, 4, 5, 16, 512].flatMap((count) => [
      `_buy1 ${'.'.repeat(count)} _get1 free`,
      `xbuy1 ${'—'.repeat(count)} and ${','.repeat(count)} xget1 free`,
    ]),
    '_buy1 .... get one free',
    '_b_uy1 .... and .... _g_et1 free',
    'xb\u0301uy1 .... and .... xg\u0301et1 free',
    '_buy1<br>....<b>and</b>\n....<i>_get1</i> free',
    '_buy1 ....\n_get1 free',
  ])(
    'vetoes frontier buy/get pairs without delimiter cliffs or duplicate rescue: "%s"',
    (mutation) => {
      expectNoOfferRescue(mutation, 40)
    },
  )
  it.each([
    '4Fingers chicken. Opening hours 11am to 8pm. Outlet B1-K05A.',
    'Target1 pizza.',
    'Part _buy1 .... unrelated outlet _get1.',
    'Part _buy1 and warehouse _get1.',
  ])('keeps frontier buy/get metadata with exact supported offers: "%s"', (metadata) => {
    for (const [offer, offerType, priceMinor, discountPercent] of [
      ['50% off', 'PERCENT_OFF', null, 50],
      ['promotion S$5.50', 'FIXED_PRICE', 550, null],
      ['1-for-1', 'BUY_ONE_GET_ONE', null, null],
    ] as const) {
      for (const field of ['title', 'content', 'excerpt'] as const) {
        const input = withValidity(`Singapore pizza ${offer}`)
        input[field].rendered = `${metadata} ${input[field].rendered}`
        const originalHash = evidenceHash(input)
        const parsed = parseMoneyDigestPost(input)
        expect(parsed.post).toEqual(input)
        expect(evidenceHash(parsed.post)).toBe(originalHash)
        expect(parsed.draft).toMatchObject({ offerType, priceMinor, discountPercent })
        expect(readyAtReviewTime(parsed), `${offer}/${field}`).toBe(true)
      }
    }
  })
  it.each([
    '_2nd item 50% off',
    '_2nd item requires membership',
    'x2nd item requires membership',
    '1_2nd item 50% off',
    '__2_nd item requires membership',
    'x2n_d item 50% off',
    '\u03012nd item requires membership',
    'x2n\u0301d item 50% off',
    '_2nd, item requires membership',
    '_2nd — item 50% off',
    '_2nd<br>item requires membership',
    '_2&#110;d item 50% off',
    '_2nditem requires membership',
    'item2nd requires membership',
    '_2nd-items 50% off',
    'item: _2nd requires membership',
  ])('vetoes prefixed ordinal item qualifications without duplicate rescue: "%s"', (mutation) => {
    expectNoOfferRescue(mutation)
  })
  it.each([
    'Part x2nd spare parts.',
    'Outlet unit _2nd; warehouse inventory.',
    'Part x2nd alpha beta gamma delta item.',
    'Brand 22ndStreet chicken.',
  ])('keeps unrelated prefixed ordinal metadata without inventing an offer: "%s"', (metadata) => {
    expect(parseMoneyDigestPost(post(`Singapore pizza ${metadata}`))).toMatchObject({
      status: 'IGNORED',
      draft: null,
    })
    for (const offer of ['50% off', 'promotion S$5.50', '1-for-1']) {
      for (const field of ['title', 'content', 'excerpt'] as const) {
        const input = withValidity(`Singapore pizza ${offer}`)
        input[field].rendered = `${metadata} ${input[field].rendered}`
        const originalHash = evidenceHash(input)
        const parsed = parseMoneyDigestPost(input)
        expect(parsed.post).toEqual(input)
        expect(evidenceHash(parsed.post)).toBe(originalHash)
        expect(readyAtReviewTime(parsed), `${offer}/${field}`).toBe(true)
      }
    }
  })
  it.each([
    '_buy1 _get1 free',
    'xbuy1 xget1 free',
    '1buy1 1get1 free',
    '__buy_1 __get_1 free',
    'x_buyx1 x_getx1 free',
    '_b_uy1 _g_et1 free',
    '\u0301buy1 \u0301get1 free',
    'xb\u0301uy1 xg\u0301et1 free',
    '_buy1, _get1 free',
    '_buy1 — _get1 free',
    '_buy1<br>_get1 free',
    '_buy&#49; _get&#49; free',
    '_buy1 get one free',
    'buy one _get1 free',
    '_buy1_get1free',
    'xbuyone2 xgetone2 free',
  ])('vetoes prefixed buy/get quantity pairs without duplicate rescue: "%s"', (mutation) => {
    expectNoOfferRescue(mutation)
  })
  it.each([
    'Target1 chicken.',
    'Target1 free delivery.',
    'Outlet unit: B1-K05A; part xget1.',
    'Part xbuy1; unrelated outlet xget1.',
    'Part _buy1. Outlet _get1.',
    'Part xbuy1 alpha beta gamma delta xget1.',
  ])('keeps incidental prefixed buy/get metadata without inventing an offer: "%s"', (metadata) => {
    expect(parseMoneyDigestPost(post(`Singapore pizza ${metadata}`))).toMatchObject({
      status: 'IGNORED',
      draft: null,
    })
    for (const offer of ['50% off', 'promotion S$5.50', '1-for-1']) {
      for (const field of ['title', 'content', 'excerpt'] as const) {
        const input = withValidity(`Singapore pizza ${offer}`)
        input[field].rendered = `${metadata} ${input[field].rendered}`
        const originalHash = evidenceHash(input)
        const parsed = parseMoneyDigestPost(input)
        expect(parsed.post).toEqual(input)
        expect(evidenceHash(parsed.post)).toBe(originalHash)
        expect(readyAtReviewTime(parsed), `${offer}/${field}`).toBe(true)
      }
    }
  })
  it.each([
    '2nditem 50% off',
    '2_nd item 50% off',
    'buyone2 getone2 with 50% off',
    'buyx1 getx1 with 50% off',
    '25xpercent off',
    'percentx25 off',
    '2e50',
    '2e 50',
  ])('retains malformed semantic anchors inside maximal identifiers: "%s"', (mutation) => {
    expectNoOfferRescue(mutation)
  })
  it.each(['title', 'content', 'excerpt'] as const)(
    'retains named free-item evidence in %s without approval-ready dates',
    (field) => {
      for (const offer of [
        'Buy one vanilla cake and get another free.',
        'Buy one <b>vanilla</b> cake and get another free.',
      ]) {
        for (const base of ['Singapore pizza', 'Singapore pizza 1-for-1']) {
          const input = withValidity(base)
          input[field].rendered = `${offer} ${input[field].rendered}`
          const originalHash = evidenceHash(input)
          const parsed = parseMoneyDigestPost(input)
          expect(parsed.post).toEqual(input)
          expect(evidenceHash(parsed.post)).toBe(originalHash)
          expect(parsed.status).toBe('NEEDS_REVIEW')
          expect(parsed.draft).toMatchObject({
            offerType: 'BUY_ONE_GET_ONE',
            priceMinor: null,
            discountPercent: null,
            validFrom: null,
            validUntil: null,
          })
          expect(parsed.draft?.rawValidityText).toContain('Valid from 1 October 2026')
          expect(readyAtReviewTime(parsed)).toBe(false)
        }
      }
    },
  )
  it.each([
    'Buy one and get another free',
    'Buy one vanilla cake then get another free',
    'Buy one vanilla.cake and get another free',
    'Buy one cake2 and get another free',
    'Buy one vanilla cake and get another free2',
    'Buy one vanilla cake and get another paid',
    'Buy one vanilla cake and get another at half price',
    'Buy one vanilla cake and get another free. 2nd item requires membership',
    'Buy one vanilla cake and get another free. buy1 get1',
    'Buy one vanilla cake and get another free. 25percent off',
    'Buy one vanilla cake and get another free. S$5.505 only',
    'Buy one vanilla cake and get another free. Buy one cupcake with conditions',
    `Buy one ${'vanilla '.repeat(9)}cake and get another free`,
  ])('does not rescue unsafe or unsupported named-item evidence: "%s"', (mutation) => {
    expectNoOfferRescue(mutation)
  })
  it.each([
    '2nd item 50% off',
    '2nd item requires membership',
    '2ND item requires membership',
    '2&#110;d item requires membership',
  ])(
    'vetoes complete ordinal qualifications without fallback or duplicate rescue: "%s"',
    (mutation) => {
      expectNoOfferRescue(mutation)
    },
  )
  it.each([
    'buy1 get1 with 50% off',
    'buy1 get1',
    'buy1 get1 free',
    'buy1',
    'get1',
    'buy1 get one',
    'buy one get1',
    'BUY1 GET1',
    'buy1<br>get1',
    'buy&#49; get&#49;',
    'buy1x get1x',
    'buy_1 get_1',
    'buy1get1',
  ])(
    'inventories merged buy/get quantities without fallback or duplicate rescue: "%s"',
    (mutation) => {
      expectNoOfferRescue(mutation)
    },
  )
  it.each([
    '25percent off',
    '25percentage off',
    '25PERCENT off',
    '25perce&#110;t off',
    '25percent discount',
    '25percentage discount',
    '2.50percent off',
    '25_percent off',
    'percent25 off',
    'percentage25 off',
  ])(
    'inventories merged percent markers without fallback or duplicate rescue: "%s"',
    (mutation) => {
      expectNoOfferRescue(mutation)
    },
  )
  it.each(['Opening hours: 11am to 8pm.', '4Fingers chicken.', 'Outlet unit: B1-K05A.'])(
    'preserves supported offers with unrelated alphanumeric metadata: "%s"',
    (metadata) => {
      for (const [offer, offerType, priceMinor, discountPercent] of [
        ['1-for-1', 'BUY_ONE_GET_ONE', null, null],
        ['50% off', 'PERCENT_OFF', null, 50],
        ['promotion S$5.50', 'FIXED_PRICE', 550, null],
      ] as const) {
        for (const field of ['title', 'content', 'excerpt'] as const) {
          const input = withValidity(`Singapore pizza ${offer}`)
          input[field].rendered = `${metadata} ${input[field].rendered}`
          const original = JSON.stringify(input)
          const originalHash = evidenceHash(input)
          const parsed = parseMoneyDigestPost(input)
          expect(JSON.stringify(input)).toBe(original)
          expect(parsed.post).toEqual(input)
          expect(evidenceHash(parsed.post)).toBe(originalHash)
          expect(parsed.status).toBe('NEEDS_REVIEW')
          expect(parsed.draft).toMatchObject({ offerType, priceMinor, discountPercent })
          expect(readyAtReviewTime(parsed), `${offer}/${field}`).toBe(true)
        }
      }
    },
  )
  it.each(['11am% off', 'S$4Fingers only', 'B1-K05A-for-1'])(
    'still vetoes metadata-shaped identifiers used as malformed offer operands: "%s"',
    (mutation) => {
      for (const field of ['title', 'content', 'excerpt'] as const) {
        const input = withValidity('Singapore pizza 50% off')
        input[field].rendered += ` ${mutation}.`
        const parsed = parseMoneyDigestPost(input)
        expect(parsed.post).toEqual(input)
        expect(parsed).toMatchObject({ status: 'IGNORED', draft: null })
        expect(readyAtReviewTime(parsed)).toBe(false)
      }
    },
  )
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

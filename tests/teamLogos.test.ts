import assert from 'node:assert/strict'
import test from 'node:test'
import { cbsTeamLogoUrl, svgNeedsDarkBackdrop } from '../src/teamLogos.ts'

test('cbsTeamLogoUrl decodes the CBS team number from the slate id', () => {
  assert.equal(
    cbsTeamLogoUrl('krswc3j2ha2dm==='),
    'https://sports.cbsimg.net/fly/images/team-logos/light/846.svg',
  )
})

test('svgNeedsDarkBackdrop flags all-white CBS marks', () => {
  assert.equal(
    svgNeedsDarkBackdrop(
      '<svg><path fill="none"/><path fill="#FFFFFF"/><path fill="white"/></svg>',
    ),
    true,
  )
  assert.equal(
    svgNeedsDarkBackdrop('<svg><path fill="#FEFEFE"/></svg>'),
    true,
  )
})

test('svgNeedsDarkBackdrop leaves mixed or dark marks alone', () => {
  assert.equal(
    svgNeedsDarkBackdrop(
      '<svg><path fill="#00274C"/><path fill="#F5C300"/></svg>',
    ),
    false,
  )
  assert.equal(
    svgNeedsDarkBackdrop(
      '<svg><path fill="#000000"/><path fill="#FFFFFF"/><path fill="#A60C31"/></svg>',
    ),
    false,
  )
  assert.equal(svgNeedsDarkBackdrop('<svg><path fill="none"/></svg>'), false)
})

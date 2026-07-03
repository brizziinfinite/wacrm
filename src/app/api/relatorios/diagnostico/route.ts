import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface StageData {
  stageId: string
  stageName: string
  position: number
  totalDeals: number
  wonDeals: number
  lostDeals: number
  openDeals: number
  totalValue: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { stages: StageData[]; pipelineName: string }
  const { stages, pipelineName } = body

  if (!stages?.length) {
    return NextResponse.json({ error: 'No stage data provided' }, { status: 400 })
  }

  const firstStage = stages[0]
  const lastStage = stages[stages.length - 1]
  const totalEntrada = firstStage?.totalDeals ?? 0
  const totalGanhos = stages.reduce((s, st) => s + st.wonDeals, 0)
  const taxaGeral = totalEntrada > 0 ? ((totalGanhos / totalEntrada) * 100).toFixed(1) : '0'

  const stagesText = stages
    .map((s, i) => {
      const prev = i > 0 ? stages[i - 1] : null
      const dropRate = prev && prev.totalDeals > 0
        ? (((prev.totalDeals - s.totalDeals) / prev.totalDeals) * 100).toFixed(1)
        : null
      return `- Etapa ${i + 1}: "${s.stageName}" → ${s.totalDeals} deals (${s.wonDeals} ganhos, ${s.lostDeals} perdidos, ${s.openDeals} em aberto)${dropRate ? ` — queda de ${dropRate}% em relação à etapa anterior` : ''}`
    })
    .join('\n')

  const prompt = `Você é um especialista em vendas B2B e CRM. Analise os dados do funil de vendas abaixo e forneça um diagnóstico objetivo em português brasileiro.

Pipeline: ${pipelineName}
Taxa de conversão geral: ${taxaGeral}% (${totalGanhos} ganhos de ${totalEntrada} leads)

Dados por etapa:
${stagesText}

Retorne APENAS um JSON válido neste formato exato, sem texto adicional:
{
  "resumo": "string de 1-2 frases resumindo o estado do funil",
  "taxaConversao": "${taxaGeral}",
  "gargalo": "nome da etapa com maior queda percentual",
  "causasPravaveis": [
    { "causa": "string", "probabilidade": "alta|media|baixa", "acao": "string com ação corretiva" }
  ],
  "pontoForte": "string com o que está funcionando bem no funil"
}`

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
      }),
    }
  )

  if (!geminiRes.ok) {
    const err = await geminiRes.text()
    console.error('Gemini error:', err)
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }

  const geminiData = await geminiRes.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
  }
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  try {
    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 502 })
  }
}

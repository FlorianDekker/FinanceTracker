# Meetrapport bonnetjes uitlezen (Fase 5, stap 1)

Gegenereerd door `npm run test:receipts` op 2026-09-14 14:42.
Provider: `https://api.together.xyz/v1` · 56 API-calls · geschatte kosten van deze run: **$0.0486**.

Prijzen per miljoen tokens: `Qwen/Qwen3.5-9B` $0.17/$0.25 · `MiniMaxAI/MiniMax-M3` $0.3/$1.2.

## Invoervarianten

- **ah_bon_2026-09-10.pdf · tekst** — 1 pagina('s), 786 tekens
- **ah_bon_2026-09-10.pdf · vision** — 1131×1600, 112 KB JPEG via sips
- **ah_bon_2026-09-10.pdf · vision + tekst** — gerenderde pagina + uitgelezen tekst in dezelfde aanroep
- **lidl_bon_a.jpeg · 1× maxSide1600** — origineel 1206×3937 → 490×1600, 123 KB
- **lidl_bon_a.jpeg · 2 stukken maxSide1600** — 908×1600 (143 KB) + 908×1600 (120 KB)
- **lidl_bon_b.jpeg · 1× maxSide1600** — origineel 1206×3802 → 507×1600, 120 KB
- **lidl_bon_b.jpeg · 2 stukken maxSide1600** — 940×1600 (145 KB) + 940×1600 (121 KB)

## Beeldformaat en prompt-tokens

De prompt zelf is ongeveer 700 tokens; de rest is beeld. Ter vergelijking: de hele AH-bon als tékst kost 1414 prompt-tokens.

| Invoer | Afmetingen en grootte | Gem. prompt-tokens |
|---|---|---:|
| ah_bon_2026-09-10.pdf · vision | 1131×1600, 112 KB JPEG via sips | 3086 |
| ah_bon_2026-09-10.pdf · vision + tekst | gerenderde pagina + uitgelezen tekst in dezelfde aanroep | 3497 |
| lidl_bon_a.jpeg · 1× maxSide1600 | origineel 1206×3937 → 490×1600, 123 KB | 1919 |
| lidl_bon_a.jpeg · 2 stukken maxSide1600 | 908×1600 (143 KB) + 908×1600 (120 KB) | 4338 |
| lidl_bon_b.jpeg · 1× maxSide1600 | origineel 1206×3802 → 507×1600, 120 KB | 1973 |
| lidl_bon_b.jpeg · 2 stukken maxSide1600 | 940×1600 (145 KB) + 940×1600 (121 KB) | 4446 |

## Resultaten

| Invoer | Model | Taal | Score | Latency | Tokens in/uit | $/bon | Validatie | Fouten |
|---|---|---|---:|---:|---:|---:|:--:|---|
| ah_bon_2026-09-10.pdf · tekst | `MiniMaxAI/MiniMax-M3` | nl | 10.00 / 10 | 2386 ms | 1480 / 159 | $0.00063 | 2/2 | – |
| ah_bon_2026-09-10.pdf · vision | `Qwen/Qwen3.5-9B` | nl | 10.00 / 10 | 4169 ms | 2760 / 263 | $0.00053 | 2/2 | – |
| ah_bon_2026-09-10.pdf · vision | `Qwen/Qwen3.5-9B` | en | 10.00 / 10 | 2798 ms | 2669 / 265 | $0.00052 | 2/2 | – |
| ah_bon_2026-09-10.pdf · vision | `MiniMaxAI/MiniMax-M3` | nl | 10.00 / 10 | 3718 ms | 3529 / 159 | $0.00125 | 2/2 | – |
| ah_bon_2026-09-10.pdf · vision | `MiniMaxAI/MiniMax-M3` | en | 10.00 / 10 | 3996 ms | 3387 / 164 | $0.00121 | 2/2 | – |
| ah_bon_2026-09-10.pdf · vision + tekst | `Qwen/Qwen3.5-9B` | nl | 10.00 / 10 | 3238 ms | 3229 / 262 | $0.00061 | 2/2 | – |
| ah_bon_2026-09-10.pdf · vision + tekst | `Qwen/Qwen3.5-9B` | en | 10.00 / 10 | 3098 ms | 3132 / 261 | $0.00060 | 2/2 | – |
| ah_bon_2026-09-10.pdf · vision + tekst | `MiniMaxAI/MiniMax-M3` | nl | 10.00 / 10 | 2957 ms | 3887 / 164 | $0.00136 | 2/2 | – |
| ah_bon_2026-09-10.pdf · vision + tekst | `MiniMaxAI/MiniMax-M3` | en | 10.00 / 10 | 3508 ms | 3740 / 164 | $0.00132 | 2/2 | – |
| lidl_bon_a.jpeg · 1× maxSide1600 | `Qwen/Qwen3.5-9B` | nl | 10.00 / 10 | 2390 ms | 1760 / 184 | $0.00035 | 2/2 | – |
| lidl_bon_a.jpeg · 1× maxSide1600 | `Qwen/Qwen3.5-9B` | en | 10.00 / 10 | 1754 ms | 1669 / 192 | $0.00033 | 2/2 | – |
| lidl_bon_a.jpeg · 1× maxSide1600 | `MiniMaxAI/MiniMax-M3` | nl | 10.00 / 10 | 2611 ms | 2195 / 110 | $0.00079 | 2/2 | – |
| lidl_bon_a.jpeg · 1× maxSide1600 | `MiniMaxAI/MiniMax-M3` | en | 10.00 / 10 | 2186 ms | 2053 / 119 | $0.00076 | 2/2 | – |
| lidl_bon_a.jpeg · 2 stukken maxSide1600 | `Qwen/Qwen3.5-9B` | nl | 10.00 / 10 | 7865 ms | 3812 / 184 | $0.00069 | 2/2 | – |
| lidl_bon_a.jpeg · 2 stukken maxSide1600 | `Qwen/Qwen3.5-9B` | en | 10.00 / 10 | 3719 ms | 3721 / 192 | $0.00068 | 2/2 | – |
| lidl_bon_a.jpeg · 2 stukken maxSide1600 | `MiniMaxAI/MiniMax-M3` | nl | 10.00 / 10 | 3515 ms | 4981 / 119 | $0.00164 | 2/2 | – |
| lidl_bon_a.jpeg · 2 stukken maxSide1600 | `MiniMaxAI/MiniMax-M3` | en | 10.00 / 10 | 3155 ms | 4839 / 119 | $0.00159 | 2/2 | – |
| lidl_bon_b.jpeg · 1× maxSide1600 | `Qwen/Qwen3.5-9B` | nl | 10.00 / 10 | 1723 ms | 1810 / 134 | $0.00034 | 2/2 | – |
| lidl_bon_b.jpeg · 1× maxSide1600 | `Qwen/Qwen3.5-9B` | en | 10.00 / 10 | 1475 ms | 1719 / 154 | $0.00033 | 2/2 | – |
| lidl_bon_b.jpeg · 1× maxSide1600 | `MiniMaxAI/MiniMax-M3` | nl | 10.00 / 10 | 1916 ms | 2253 / 75 | $0.00077 | 2/2 | – |
| lidl_bon_b.jpeg · 1× maxSide1600 | `MiniMaxAI/MiniMax-M3` | en | 10.00 / 10 | 4129 ms | 2111 / 84 | $0.00073 | 2/2 | – |
| lidl_bon_b.jpeg · 2 stukken maxSide1600 | `Qwen/Qwen3.5-9B` | nl | 10.00 / 10 | 8533 ms | 3912 / 134 | $0.00070 | 2/2 | – |
| lidl_bon_b.jpeg · 2 stukken maxSide1600 | `Qwen/Qwen3.5-9B` | en | 10.00 / 10 | 5720 ms | 3821 / 158 | $0.00069 | 2/2 | – |
| lidl_bon_b.jpeg · 2 stukken maxSide1600 | `MiniMaxAI/MiniMax-M3` | nl | 10.00 / 10 | 3041 ms | 5097 / 87 | $0.00163 | 2/2 | – |
| lidl_bon_b.jpeg · 2 stukken maxSide1600 | `MiniMaxAI/MiniMax-M3` | en | 10.00 / 10 | 3217 ms | 4955 / 96 | $0.00160 | 2/2 | – |
| ah_bon_2026-09-10.pdf · tekst | `Qwen/Qwen3.5-9B` | nl | 9.50 / 10 | 3154 ms | 1459 / 262 | $0.00031 | 2/2 | – |
| ah_bon_2026-09-10.pdf · tekst | `MiniMaxAI/MiniMax-M3` | en | 9.50 / 10 | 3755 ms | 1347 / 211 | $0.00066 | 2/2 | – |
| ah_bon_2026-09-10.pdf · tekst | `Qwen/Qwen3.5-9B` | en | 7.00 / 10 | 2821 ms | 1368 / 265 | $0.00030 | 0/2 | – |

## Denkstand (redeneermodellen)

Zelfde invoer, alleen `chat_template_kwargs: { enable_thinking: false }` aan/uit.

| Model | Denken | Score | Latency | Uit-tokens | $/bon |
|---|:--:|---:|---:|---:|---:|
| `Qwen/Qwen3.5-9B` | uit | 9.50 / 10 | 3018 ms | 262 | $0.00031 |
| `Qwen/Qwen3.5-9B` | aan | 9.50 / 10 | 31089 ms | 3716 | $0.00118 |
| `MiniMaxAI/MiniMax-M3` | uit | 10.00 / 10 | 4412 ms | 164 | $0.00064 |
| `MiniMaxAI/MiniMax-M3` | aan | 10.00 / 10 | 2940 ms | 154 | $0.00063 |

## Per run

### ah_bon_2026-09-10.pdf · tekst · `Qwen/Qwen3.5-9B` · nl · run 1

Score **9.5/10** · 2764 ms · 1459 in / 262 uit · $0.00031 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✗ tijd (kreeg: "17:52") · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:52",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "snacks_snoep"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "kant_en_klaar"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "overig"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · tekst · `Qwen/Qwen3.5-9B` · nl · run 2

Score **9.5/10** · 3543 ms · 1459 in / 262 uit · $0.00031 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✗ tijd (kreeg: "17:52") · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:52",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "snacks_snoep"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "snacks_snoep"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "overig"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · tekst · `Qwen/Qwen3.5-9B` · en · run 1

Score **7/10** · 3398 ms · 1368 in / 265 uit · $0.00030 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✗ totaal (kreeg: 6.76) · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✗ validatie (kreeg: diff 0.61)

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 6.76,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "snacks_snoep"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "kant_en_klaar"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "kant_en_klaar"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0.61,
  "ok": false,
  "reden": "som wijkt af van het totaal"
 }
}
```

### ah_bon_2026-09-10.pdf · tekst · `Qwen/Qwen3.5-9B` · en · run 2

Score **7/10** · 2243 ms · 1368 in / 265 uit · $0.00030 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✗ totaal (kreeg: 6.76) · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✗ validatie (kreeg: diff 0.61)

_JSON identiek aan run 1 van deze combinatie._

### ah_bon_2026-09-10.pdf · tekst · `MiniMaxAI/MiniMax-M3` · nl · run 1

Score **10/10** · 2653 ms · 1480 in / 164 uit · $0.00064 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "kant_en_klaar"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "snacks_snoep"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "snacks_snoep"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · tekst · `MiniMaxAI/MiniMax-M3` · nl · run 2

Score **10/10** · 2118 ms · 1480 in / 154 uit · $0.00063 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "overig"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "overig"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "overig"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · tekst · `MiniMaxAI/MiniMax-M3` · en · run 1

Score **9.5/10** · 4123 ms · 1347 in / 211 uit · $0.00066 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✗ tijd (kreeg: "17:52") · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:52",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "kant_en_klaar"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "snacks_snoep"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "snacks_snoep"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · tekst · `MiniMaxAI/MiniMax-M3` · en · run 2

Score **9.5/10** · 3386 ms · 1347 in / 211 uit · $0.00066 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✗ tijd (kreeg: "17:52") · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### ah_bon_2026-09-10.pdf · vision · `Qwen/Qwen3.5-9B` · nl · run 1

Score **10/10** · 4243 ms · 2760 in / 263 uit · $0.00053 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "kant_en_klaar"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "kant_en_klaar"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "huishouden"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision · `Qwen/Qwen3.5-9B` · nl · run 2

Score **10/10** · 4095 ms · 2760 in / 263 uit · $0.00053 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### ah_bon_2026-09-10.pdf · vision · `Qwen/Qwen3.5-9B` · en · run 1

Score **10/10** · 2925 ms · 2669 in / 265 uit · $0.00052 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "kant_en_klaar"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "kant_en_klaar"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "kant_en_klaar"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision · `Qwen/Qwen3.5-9B` · en · run 2

Score **10/10** · 2671 ms · 2669 in / 265 uit · $0.00052 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### ah_bon_2026-09-10.pdf · vision · `MiniMaxAI/MiniMax-M3` · nl · run 1

Score **10/10** · 3715 ms · 3529 in / 154 uit · $0.00124 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "overig"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "overig"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "overig"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision · `MiniMaxAI/MiniMax-M3` · nl · run 2

Score **10/10** · 3720 ms · 3529 in / 164 uit · $0.00126 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "kant_en_klaar"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "snacks_snoep"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "snacks_snoep"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision · `MiniMaxAI/MiniMax-M3` · en · run 1

Score **10/10** · 3913 ms · 3387 in / 164 uit · $0.00121 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "kant_en_klaar"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "snacks_snoep"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "snacks_snoep"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision · `MiniMaxAI/MiniMax-M3` · en · run 2

Score **10/10** · 4079 ms · 3387 in / 164 uit · $0.00121 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### ah_bon_2026-09-10.pdf · vision + tekst · `Qwen/Qwen3.5-9B` · nl · run 1

Score **10/10** · 2889 ms · 3229 in / 259 uit · $0.00061 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "snacks_snoep"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "dranken"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "dranken"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision + tekst · `Qwen/Qwen3.5-9B` · nl · run 2

Score **10/10** · 3586 ms · 3229 in / 265 uit · $0.00062 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "kant_en_klaar"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "kant_en_klaar"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "kant_en_klaar"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision + tekst · `Qwen/Qwen3.5-9B` · en · run 1

Score **10/10** · 2886 ms · 3132 in / 261 uit · $0.00060 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "snacks_snoep"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "zuivel_eieren"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "dranken"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision + tekst · `Qwen/Qwen3.5-9B` · en · run 2

Score **10/10** · 3310 ms · 3132 in / 261 uit · $0.00060 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### ah_bon_2026-09-10.pdf · vision + tekst · `MiniMaxAI/MiniMax-M3` · nl · run 1

Score **10/10** · 2463 ms · 3887 in / 164 uit · $0.00136 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "kant_en_klaar"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "snacks_snoep"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "snacks_snoep"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision + tekst · `MiniMaxAI/MiniMax-M3` · nl · run 2

Score **10/10** · 3450 ms · 3887 in / 164 uit · $0.00136 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### ah_bon_2026-09-10.pdf · vision + tekst · `MiniMaxAI/MiniMax-M3` · en · run 1

Score **10/10** · 2552 ms · 3740 in / 164 uit · $0.00132 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Albert Heijn",
 "date": "2026-09-10",
 "time": "17:51",
 "total": 7.37,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "FUSILLI SALS",
   "qty": 1,
   "unitPrice": 5.99,
   "price": 5.99,
   "group": "kant_en_klaar"
  },
  {
   "name": "TERRA CREME",
   "qty": 1,
   "unitPrice": 0.89,
   "price": 0.89,
   "group": "snacks_snoep"
  },
  {
   "name": "AH VVP HAGEL",
   "qty": 1,
   "unitPrice": 2.89,
   "price": 2.89,
   "group": "snacks_snoep"
  }
 ],
 "discounts": [
  {
   "name": "40% K FUSILLI SALS",
   "amount": 2.4
  }
 ],
 "validation": {
  "itemsSum": 9.77,
  "discountSum": 2.4,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### ah_bon_2026-09-10.pdf · vision + tekst · `MiniMaxAI/MiniMax-M3` · en · run 2

Score **10/10** · 4463 ms · 3740 in / 164 uit · $0.00132 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_a.jpeg · 1× maxSide1600 · `Qwen/Qwen3.5-9B` · nl · run 1

Score **10/10** · 2836 ms · 1760 in / 184 uit · $0.00035 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "huishouden"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_a.jpeg · 1× maxSide1600 · `Qwen/Qwen3.5-9B` · nl · run 2

Score **10/10** · 1943 ms · 1760 in / 184 uit · $0.00035 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_a.jpeg · 1× maxSide1600 · `Qwen/Qwen3.5-9B` · en · run 1

Score **10/10** · 1693 ms · 1669 in / 192 uit · $0.00033 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buikslotermeerplein",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "huishouden"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_a.jpeg · 1× maxSide1600 · `Qwen/Qwen3.5-9B` · en · run 2

Score **10/10** · 1815 ms · 1669 in / 192 uit · $0.00033 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_a.jpeg · 1× maxSide1600 · `MiniMaxAI/MiniMax-M3` · nl · run 1

Score **10/10** · 2732 ms · 2195 in / 110 uit · $0.00079 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "verzorging"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_a.jpeg · 1× maxSide1600 · `MiniMaxAI/MiniMax-M3` · nl · run 2

Score **10/10** · 2489 ms · 2195 in / 110 uit · $0.00079 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_a.jpeg · 1× maxSide1600 · `MiniMaxAI/MiniMax-M3` · en · run 1

Score **10/10** · 2485 ms · 2053 in / 119 uit · $0.00076 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buiksloterermeerplein",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "verzorging"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_a.jpeg · 1× maxSide1600 · `MiniMaxAI/MiniMax-M3` · en · run 2

Score **10/10** · 1887 ms · 2053 in / 119 uit · $0.00076 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_a.jpeg · 2 stukken maxSide1600 · `Qwen/Qwen3.5-9B` · nl · run 1

Score **10/10** · 3714 ms · 3812 in / 184 uit · $0.00069 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "huishouden"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_a.jpeg · 2 stukken maxSide1600 · `Qwen/Qwen3.5-9B` · nl · run 2

Score **10/10** · 12016 ms · 3812 in / 184 uit · $0.00069 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_a.jpeg · 2 stukken maxSide1600 · `Qwen/Qwen3.5-9B` · en · run 1

Score **10/10** · 2797 ms · 3721 in / 192 uit · $0.00068 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buikslotermeerplein",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "huishouden"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_a.jpeg · 2 stukken maxSide1600 · `Qwen/Qwen3.5-9B` · en · run 2

Score **10/10** · 4641 ms · 3721 in / 192 uit · $0.00068 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_a.jpeg · 2 stukken maxSide1600 · `MiniMaxAI/MiniMax-M3` · nl · run 1

Score **10/10** · 3004 ms · 4981 in / 119 uit · $0.00164 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buiksloter-meerplein",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "verzorging"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_a.jpeg · 2 stukken maxSide1600 · `MiniMaxAI/MiniMax-M3` · nl · run 2

Score **10/10** · 4026 ms · 4981 in / 119 uit · $0.00164 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buiksloterermeerplein",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "verzorging"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_a.jpeg · 2 stukken maxSide1600 · `MiniMaxAI/MiniMax-M3` · en · run 1

Score **10/10** · 2759 ms · 4839 in / 119 uit · $0.00159 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buiksloter-meerplein",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "verzorging"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_a.jpeg · 2 stukken maxSide1600 · `MiniMaxAI/MiniMax-M3` · en · run 2

Score **10/10** · 3551 ms · 4839 in / 119 uit · $0.00159 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buiksloterermeerplein",
 "date": "2026-02-11",
 "time": "20:22",
 "total": 3.24,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Chips Great Britain",
   "qty": 1,
   "unitPrice": 1.69,
   "price": 1.69,
   "group": "snacks_snoep"
  },
  {
   "name": "Zakdoekjes balsem",
   "qty": 1,
   "unitPrice": 1.55,
   "price": 1.55,
   "group": "verzorging"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 3.24,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_b.jpeg · 1× maxSide1600 · `Qwen/Qwen3.5-9B` · nl · run 1

Score **10/10** · 1745 ms · 1810 in / 134 uit · $0.00034 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl",
 "date": "2026-03-13",
 "time": "20:14",
 "total": 8.79,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Veg. proteïne poeder",
   "qty": 1,
   "unitPrice": 8.79,
   "price": 8.79,
   "group": "overig"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 8.79,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_b.jpeg · 1× maxSide1600 · `Qwen/Qwen3.5-9B` · nl · run 2

Score **10/10** · 1701 ms · 1810 in / 134 uit · $0.00034 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_b.jpeg · 1× maxSide1600 · `Qwen/Qwen3.5-9B` · en · run 1

Score **10/10** · 1421 ms · 1719 in / 154 uit · $0.00033 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buikslotermeerplein",
 "date": "2026-03-13",
 "time": "20:14",
 "total": 8.79,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Veg. proteïne poeder",
   "qty": 1,
   "unitPrice": 8.79,
   "price": 8.79,
   "group": "overig"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 8.79,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_b.jpeg · 1× maxSide1600 · `Qwen/Qwen3.5-9B` · en · run 2

Score **10/10** · 1529 ms · 1719 in / 154 uit · $0.00033 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_b.jpeg · 1× maxSide1600 · `MiniMaxAI/MiniMax-M3` · nl · run 1

Score **10/10** · 2323 ms · 2253 in / 75 uit · $0.00077 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl",
 "date": "2026-03-13",
 "time": "20:14",
 "total": 8.79,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Veg. proteïne poeder",
   "qty": 1,
   "unitPrice": 8.79,
   "price": 8.79,
   "group": "overig"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 8.79,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_b.jpeg · 1× maxSide1600 · `MiniMaxAI/MiniMax-M3` · nl · run 2

Score **10/10** · 1509 ms · 2253 in / 75 uit · $0.00077 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_b.jpeg · 1× maxSide1600 · `MiniMaxAI/MiniMax-M3` · en · run 1

Score **10/10** · 3873 ms · 2111 in / 84 uit · $0.00073 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buiksloterermeerplein",
 "date": "2026-03-13",
 "time": "20:14",
 "total": 8.79,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Veg. proteïne poeder",
   "qty": 1,
   "unitPrice": 8.79,
   "price": 8.79,
   "group": "overig"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 8.79,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_b.jpeg · 1× maxSide1600 · `MiniMaxAI/MiniMax-M3` · en · run 2

Score **10/10** · 4384 ms · 2111 in / 84 uit · $0.00073 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_b.jpeg · 2 stukken maxSide1600 · `Qwen/Qwen3.5-9B` · nl · run 1

Score **10/10** · 15053 ms · 3912 in / 134 uit · $0.00070 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl",
 "date": "2026-03-13",
 "time": "20:14",
 "total": 8.79,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Veg. proteïne poeder",
   "qty": 1,
   "unitPrice": 8.79,
   "price": 8.79,
   "group": "overig"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 8.79,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_b.jpeg · 2 stukken maxSide1600 · `Qwen/Qwen3.5-9B` · nl · run 2

Score **10/10** · 2013 ms · 3912 in / 134 uit · $0.00070 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_b.jpeg · 2 stukken maxSide1600 · `Qwen/Qwen3.5-9B` · en · run 1

Score **10/10** · 8858 ms · 3821 in / 158 uit · $0.00069 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buikslotermeerplein",
 "date": "2026-03-13",
 "time": "20:14",
 "total": 8.79,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Veg. proteïne poeder",
   "qty": 1,
   "unitPrice": 8.79,
   "price": 8.79,
   "group": "vlees_vis_vega"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 8.79,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_b.jpeg · 2 stukken maxSide1600 · `Qwen/Qwen3.5-9B` · en · run 2

Score **10/10** · 2582 ms · 3821 in / 158 uit · $0.00069 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_b.jpeg · 2 stukken maxSide1600 · `MiniMaxAI/MiniMax-M3` · nl · run 1

Score **10/10** · 3544 ms · 5097 in / 99 uit · $0.00165 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl",
 "date": "2026-03-13",
 "time": "20:14",
 "total": 8.79,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Veg. proteine poeder",
   "qty": 1,
   "unitPrice": 8.79,
   "price": 8.79,
   "group": "overig"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 8.79,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_b.jpeg · 2 stukken maxSide1600 · `MiniMaxAI/MiniMax-M3` · nl · run 2

Score **10/10** · 2538 ms · 5097 in / 75 uit · $0.00162 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

### lidl_bon_b.jpeg · 2 stukken maxSide1600 · `MiniMaxAI/MiniMax-M3` · en · run 1

Score **10/10** · 2541 ms · 4955 in / 84 uit · $0.00159 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

```json
{
 "merchant": "Lidl Amsterdam Buiksloterermeerplein",
 "date": "2026-03-13",
 "time": "20:14",
 "total": 8.79,
 "currency": "EUR",
 "paymentMethod": "pin",
 "items": [
  {
   "name": "Veg. proteine poeder",
   "qty": 1,
   "unitPrice": 8.79,
   "price": 8.79,
   "group": "overig"
  }
 ],
 "discounts": [],
 "validation": {
  "itemsSum": 8.79,
  "discountSum": 0,
  "diff": 0,
  "ok": true,
  "reden": null
 }
}
```

### lidl_bon_b.jpeg · 2 stukken maxSide1600 · `MiniMaxAI/MiniMax-M3` · en · run 2

Score **10/10** · 3893 ms · 4955 in / 108 uit · $0.00162 · json_object: true · finish: stop

✓ winkel · ✓ datum · ✓ tijd · ✓ totaal · ✓ aantal regels · ✓ productnamen · ✓ regelprijzen · ✓ korting · ✓ betaalwijze · ✓ validatie

_JSON identiek aan run 1 van deze combinatie._

## Conclusies en advies

_Met de hand geschreven bij de run van 14 september 2026; een nieuwe run overschrijft deze sectie._

**Is de kwaliteit goed genoeg om Fase 5 door te bouwen? Ja.** Alle 56 aanroepen
slaagden, 53 daarvan met de volle 10/10 op drie echte bonnen (AH-PDF, twee
Lidl-schermafbeeldingen). De drie lagere scores komen allemaal uit één variant:
de AH-bon als *alleen tekst* bij Qwen.

### 1. Standaardmodel: `Qwen/Qwen3.5-9B`

Op elke beeldvariant even goed als MiniMax-M3 (10/10), maar 2 tot 2,5 keer
goedkoper ($0,0003–0,0007 tegen $0,0008–0,0016 per bon) en even snel (1,5–4 s).
Met een tegoed van $4,66 komt dat neer op ruwweg 7.000 tot 9.000 bonnen.
`MiniMaxAI/MiniMax-M3` is een prima tweede keuze en de aangewezen "probeer het
nog eens met een ander model"-knop: het is het enige model dat de AH-bon óók op
alleen tekst foutloos leest.

### 2. Tekst of beeld: voor PDF's allebei

| Variant | Qwen nl | Qwen en | MiniMax nl | MiniMax en |
|---|---:|---:|---:|---:|
| alleen tekst | 9,5 | **7,0** | 10 | 9,5 |
| alleen beeld | 10 | 10 | 10 | 10 |
| beeld + tekst | 10 | 10 | 10 | 10 |

Alleen tekst is het goedkoopst (1.414 prompt-tokens) maar het minst betrouwbaar:
Qwen kiest in het Engels het bedrag 6,76 — dat is het totaal *exclusief* btw uit
de btw-tabel onderaan — in plaats van 7,37. Zonder de layout van de bon is dat
een begrijpelijke vergissing.

**Advies voor de PDF-route: render pagina 1 én stuur de uitgelezen tekst mee.**
Dat kost bij Qwen 3.497 prompt-tokens ($0,0006 per bon) en scoorde in alle vier
de combinaties 10/10. Het beeld geeft de layout en het logo (de AH-bon-tekst
bevat nergens het woord "Albert Heijn" — dat leidt het model af uit BONUSKAART,
AIRMILES en het logo), de tekst geeft exacte tekens en bedragen.
`extractPdfText` blijft sowieso nodig voor `rawText` en het doorzoeken op
productnaam.

### 3. Prompttaal: Nederlands

Op alle beeldvarianten maakt het niets uit. Het enige verschil zit in de
tekstvariant, en daar is Nederlands duidelijk beter (9,5 tegen 7,0 bij Qwen;
10 tegen 9,5 bij MiniMax). Dat is ook logisch: de bon is Nederlands en de
termen (TOTAAL, BONUSKAART, STATIEGELD, UW VOORDEEL) staan letterlijk in de
Nederlandse prompt. Bijkomend voordeel: de prompt staat in dezelfde taal als de
rest van de app.

### 4. Zet "denken" uit — dit is geen detail

`Qwen/Qwen3.5-9B` is een redeneermodel. Zonder
`chat_template_kwargs: { enable_thinking: false }` schrijft het eerst duizenden
tokens gedachten:

| | Latency | Uit-tokens | Kosten |
|---|---:|---:|---:|
| denken uit | 3,0 s | 262 | $0,00031 |
| denken aan | 31,1 s | 3.716 | $0,00118 |

En dat is nog de goede afloop: in een eerdere meting liep hetzelfde verzoek twee
keer achter elkaar vast op `finish_reason: length` na 8.000 tokens en 77
seconden — dus geen antwoord binnen de 60 seconden die de app hanteert.
`extract.js` stuurt de parameter daarom standaard mee en valt terug op een kalere
request als de provider hem niet kent.

### 5. Lange schermafbeeldingen: knippen was niet nodig

Een Lidl-Plus-schermafbeelding is 1206 × 3900 px. Naïef naar 1600 px langste
zijde schalen maakt hem 490 px breed, wat op het oog onleesbaar lijkt — maar
beide modellen lazen hem in alle vier de combinaties foutloos (10/10), inclusief
de valkuilen: de btw-tabel werd niet als product gelezen, het schuine watermerk
"KOPIE KASSABON" vervuilde geen namen, en het "Kopie Kaarthouder"-blok bleef
buiten de regels.

Knippen in twee overlappende stukken geeft dezelfde score maar kost 2,3 keer
zoveel prompt-tokens (4.338 tegen 1.919). **Advies: begin met één verkleinde
afbeelding en knip pas als de validatie faalt.** Voor bonnen die écht langer zijn
dan deze blijft de "Nog een stuk"-route uit het plan nodig.

### 6. Stuur JPEG, geen PNG

`MiniMaxAI/MiniMax-M3` antwoordt op een PNG-data-URL met `503 Service
unavailable`, terwijl exact dezelfde bon als JPEG wél werkt. In de eerste meetronde
kostte dat alle 16 MiniMax-beeldaanroepen. `downscaleImage` en `renderPdfPage`
leveren allebei JPEG, dus in de app zit dit goed — maar het is een valkuil bij
plakken vanaf het klembord, waar iOS juist `image/png` aanlevert.

### 7. Het voorbeeld in de prompt is gevaarlijk

De eerste versie van de prompt gebruikte de échte AH-bon als schemavoorbeeld.
Toen het beeld te klein was om te lezen, gaf Qwen letterlijk de
voorbeeldwaarden terug (score 1,5/10) en in zijn redenering stond met zoveel
woorden: *"the prompt example JSON used 17:51. This might be a hint."* Met een
verzonnen voorbeeld plus de regel "het voorbeeld is verzonnen, verzin nooit een
winkel, datum of bedrag; gebruik null" ging diezelfde variant naar 10/10.

### 8. De validatie doet precies waar hij voor is

De enige echt foute uitlezing (Qwen, Engels, alleen tekst, totaal 6,76) werd in
beide runs door `validateReceipt` gepakt met `diff 0.61`. Die bon zou in de app
de status `review` krijgen in plaats van stilletjes verkeerd te worden
opgeslagen. Alle 53 goede runs kwamen op `diff 0`.

### 9. Groepen zijn het zwakste onderdeel

Consistent bij duidelijke namen, wisselvallig bij afkortingen en grensgevallen
(alle runs bij elkaar geteld):

| Product | Gekozen groepen |
|---|---|
| Chips Great Britain | `snacks_snoep` 16× |
| Zakdoekjes balsem | `huishouden` 8× · `verzorging` 8× |
| Veg. proteïne poeder | `overig` 14× · `vlees_vis_vega` 2× |
| FUSILLI SALS | `kant_en_klaar` 10× · `snacks_snoep` 4× · `overig` 2× |
| AH VVP HAGEL (hagelslag) | `snacks_snoep` 6× · `overig` 4× · `kant_en_klaar` 3× · `huishouden` 2× · `dranken` 1× |

Bedragen en namen zijn dus betrouwbaar, groepen zijn een schatting. Voor de
grafieken "waar gaat het boodschappengeld heen" is dat bruikbaar, maar de UI
moet de groep makkelijk laten corrigeren — en die correctie per `nameKey`
onthouden, net zoals `merchantLearning` dat voor winkels doet. Een AH-bon met
afkortingen als `AH VVP HAGEL` zal het model nooit betrouwbaar indelen; een
eigen lijst van geleerde producten wel.

### 10. Losse eindjes voor de volgende stap

- De pdf.js-worker is een `.mjs`-bestand en valt daarmee buiten de
  `globPatterns` van de service worker (`{js,css,html,ico,png,svg}`). PDF's
  uitlezen werkt dus niet offline. Bewust zo gelaten: `mjs` toevoegen zet er
  1,2 MB bij in de precache.
- Nog niet gemeten: een gefotografeerde papieren bon (kreukels, schaduw, schuin),
  een bon van meer dan twee "stukken", en een bon met statiegeld.
- `together.ai` gaf tijdens de eerste ronde regelmatig een 503 of verbrak de
  verbinding. `extract.js` probeert het nu tot vier keer met oplopende
  wachttijd; met een pauze van 1,5 s tussen de aanroepen liepen de laatste twee
  meetronden zonder één fout.

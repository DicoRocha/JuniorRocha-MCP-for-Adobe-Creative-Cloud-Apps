# Skills

The server ships with 87 skills: playbooks the assistant loads with `jradb_get_skill` before it starts a job. A skill says in which order to decide things, which tools to call, what to check, and what a finished piece must pass before delivery. They are what makes the output follow studio practice instead of the first thing that works.

You do not call skills yourself. Describe the job; the assistant picks the skills that apply. To see which ones it used, ask.

| Area | Skills | Purpose |
|---|---:|---|
| [Planning](#planning) | 10 | Before any app is opened: the brief, the concept and the plan the production follows. |
| [Design fundamentals](#design-fundamentals) | 7 | The craft rules every piece is checked against. |
| [Photo](#photo) | 6 | Developing, retouching and exporting photographs. |
| [Social and ads](#social-and-ads) | 7 | Static pieces for feeds, stories and paid media. |
| [Vector](#vector) | 4 | Logos, icons and packaging in Illustrator. |
| [Print](#print) | 7 | Layout in InDesign, from a flyer to a manual. |
| [Motion](#motion) | 11 | Animation in After Effects. |
| [Video](#video) | 7 | Editing in Premiere Pro. |
| [Scripts](#scripts) | 7 | Writing what will be shot, animated or laid out. |
| [Prompts for generative tools](#prompts-for-generative-tools) | 7 | Writing requests for image, video and audio generators and bringing the results into the workflow. |
| [Quality and delivery](#quality-and-delivery) | 5 | The gates before anything leaves. |
| [Apps and pipelines](#apps-and-pipelines) | 9 | How each app behaves through the server, and how work moves between them. |

## Planning

Before any app is opened: the brief, the concept and the plan the production follows.

| Skill | Purpose |
|---|---|
| [`plan-briefing`](../skills/planejamento/plan-briefing/SKILL.md) | Builds the brief for a piece, a series or a campaign: goal, audience, offer, single message, proof, sector restrictions, formats and who approves. |
| [`plan-brand-kit`](../skills/planejamento/plan-brand-kit/SKILL.md) | Reads or assembles the client's brand kit (colours, fonts by role, logo versions, clear space, tone) and creates the swatches and styles in the apps. |
| [`plan-conceito-criativo`](../skills/planejamento/plan-conceito-criativo/SKILL.md) | Develops two or three distinct creative routes, each with insight, idea, tagline, visual territory and a key-visual sketch, before producing in series. |
| [`plan-moodboard`](../skills/planejamento/plan-moodboard/SKILL.md) | Assembles a style board from references (images, palette, type, textures, keywords) to agree the visual direction. |
| [`plan-campanha`](../skills/planejamento/plan-campanha/SKILL.md) | Turns the brief and the approved concept into a piece plan by funnel stage, with channel, format, message, call to action, app, dependencies and production order. |
| [`plan-calendario-social`](../skills/planejamento/plan-calendario-social/SKILL.md) | Plans a month or a quarter of social content: pillars, frequency per channel, format mix, fixed dates and production batches. |
| [`plan-anuncios`](../skills/planejamento/plan-anuncios/SKILL.md) | Plans a batch of ads for testing: angles, hooks and formats, the hypothesis behind each variation, naming, and the sheet that feeds batch production. |
| [`plan-copy`](../skills/planejamento/plan-copy/SKILL.md) | Writes headlines, supporting copy, calls to action and captions by formula and by channel, with variations for testing and character limits. |
| [`plan-roteiro-video`](../skills/planejamento/plan-roteiro-video/SKILL.md) | Chooses the video format and the right script skill, then builds the shot list, the B-roll list, the assets to capture and the post-production plan. |
| [`plan-espelho-impresso`](../skills/planejamento/plan-espelho-impresso/SKILL.md) | Plans a multi-page print job before layout: page map, modules, the data sheet for data merge and the printer's specification. |

## Design fundamentals

The craft rules every piece is checked against.

| Skill | Purpose |
|---|---|
| [`craft-composicao`](../skills/fundamentos/craft-composicao/SKILL.md) | Composition for any piece: order of decisions, hierarchy, grid and spacing scale, and the signs of amateur work to avoid. |
| [`craft-tipografia`](../skills/fundamentos/craft-tipografia/SKILL.md) | Choosing and setting type: font pairing by role, scales per medium, leading, spacing, headline breaks and how to apply them in each app. |
| [`craft-cor`](../skills/fundamentos/craft-cor/SKILL.md) | Building and applying a palette: neutrals, one accent, proportions, minimum text contrast, and the differences between screen and print colour. |
| [`craft-marca`](../skills/fundamentos/craft-marca/SKILL.md) | Applying the client's brand: the right logo version for each background, clear space, minimum size, fixed position across a series. |
| [`craft-formatos`](../skills/fundamentos/craft-formatos/SKILL.md) | Dimensions, ratios and safe zones for social networks, ads, video, slides and print, used to size the document and place the text. |
| [`craft-acessibilidade`](../skills/fundamentos/craft-acessibilidade/SKILL.md) | Making the piece legible and accessible: text contrast, minimum size per medium, captions on video, reading time in motion. |
| [`craft-filosofia-visual`](../skills/fundamentos/craft-filosofia-visual/SKILL.md) | Writing the visual philosophy of a piece or series in a few lines (form, space, colour, type, rhythm, and what the piece refuses) and using it as the review criterion. |

## Photo

Developing, retouching and exporting photographs.

| Skill | Purpose |
|---|---|
| [`foto-triagem-e-lote`](../skills/foto/foto-triagem-e-lote/SKILL.md) | Culling and batch treatment in Lightroom Classic: find, rate, group by light, treat one reference photo, sync the look and review. |
| [`foto-revelacao`](../skills/foto/foto-revelacao/SKILL.md) | Developing a photo in six closed steps (technical, tonal, colour, presence, look, detail), one block at a time, with before and after previews. |
| [`foto-retrato`](../skills/foto/foto-retrato/SKILL.md) | Portrait treatment: skin colour balance, face exposure, eyes, light clean-up and subtle dodge and burn, without changing features. |
| [`foto-produto`](../skills/foto/foto-produto/SKILL.md) | Product photos for e-commerce, catalogues and ads: clean cut-out, white or brand background, realistic contact shadow and faithful colour. |
| [`foto-recorte-e-composicao`](../skills/foto/foto-recorte-e-composicao/SKILL.md) | Cutting out a subject and compositing it on another background believably: non-destructive masks, difficult edges, matched light, colour and grain. |
| [`foto-saida`](../skills/foto/foto-saida/SKILL.md) | Exporting photos with the right format, size, colour space and sharpening for each destination, named and filed in the campaign folder. |

## Social and ads

Static pieces for feeds, stories and paid media.

| Skill | Purpose |
|---|---|
| [`social-post`](../skills/social/social-post/SKILL.md) | A static post from brief to layered PSD and exported image, with treated photo, headline, call to action and brand, in one or several formats. |
| [`social-carrossel`](../skills/social/social-carrossel/SKILL.md) | A carousel of five to ten slides from the script: template with named layers, continuity between slides and numbered export. |
| [`social-carrossel-seamless`](../skills/social/social-carrossel-seamless/SKILL.md) | A seamless (panoramic) carousel: one wide canvas cut into 1080 px cards, imagery across the seams, text and logo inside the margins; Photoshop setup and split scripts, Illustrator artboards with no gap. |
| [`social-stories-capas`](../skills/social/social-stories-capas/SKILL.md) | Stories sequences, Reels covers that work in the feed and in the grid, and highlight covers, respecting the interface zones. |
| [`social-thumbnail`](../skills/social/social-thumbnail/SKILL.md) | A video thumbnail that reads at small size: one face, one emotion, up to four words, strong separation from the background, and test variations. |
| [`ads-estatico`](../skills/social/ads-estatico/SKILL.md) | Static performance ads: the anatomy of hook, headline, proof, brand and call to action, a template per format and batch production from a sheet. |
| [`design-adaptacao-formatos`](../skills/social/design-adaptacao-formatos/SKILL.md) | Deriving a key visual into other formats by recomposing instead of stretching: reframe the photo, move the hierarchy, adjust type and safe zones. |
| [`design-mockup`](../skills/social/design-mockup/SKILL.md) | Placing artwork in a mockup (phone screen, packaging, T-shirt, card, shopfront) through a smart object, keeping perspective, light and texture. |

## Vector

Logos, icons and packaging in Illustrator.

| Skill | Purpose |
|---|---|
| [`vetor-logo-e-selo`](../skills/vetor/vetor-logo-e-selo/SKILL.md) | Building a simple logo, seal or icon with clean geometry: grid, few anchor points, consistent stroke, and positive, negative and one-colour versions. |
| [`vetor-icones`](../skills/vetor/vetor-icones/SKILL.md) | Drawing an icon family with a constant grid, stroke and corner radius, one artboard per icon, exported with consistent names. |
| [`vetor-embalagem-rotulo`](../skills/vetor/vetor-embalagem-rotulo/SKILL.md) | Laying out a label or packaging on the printer's die line: die and varnish layers, bleed, fold and glue areas, mandatory information. |
| [`vetor-pacote-de-marca`](../skills/vetor/vetor-pacote-de-marca/SKILL.md) | Exporting a logo in every delivery version and format, with standard names and a usage sheet. |

## Print

Layout in InDesign, from a flyer to a manual.

| Skill | Purpose |
|---|---|
| [`print-fundamentos`](../skills/print/print-fundamentos/SKILL.md) | The base of every print piece: document with bleed and margins, grid, paragraph styles, CMYK colours, linked images at print resolution, preflight and PDF. |
| [`print-flyer-cartaz`](../skills/print/print-flyer-cartaz/SKILL.md) | Flyers and posters that read in three seconds or from a distance: hierarchy, photo treatment, QR code, practical information on the back, print-ready PDF. |
| [`print-brochura-folder`](../skills/print/print-brochura-folder/SKILL.md) | Folders and brochures: imposition of faces and folds, a role for each panel, grid and styles, text flowing between frames. |
| [`print-catalogo`](../skills/print/print-catalogo/SKILL.md) | Catalogues, menus and price lists driven by a spreadsheet: template with styles, data merge, images per field and a price review. |
| [`print-manual`](../skills/print/print-manual/SKILL.md) | Manuals and long documents: master pages with automatic numbering, heading and body styles, generated table of contents, callouts and cross-references. |
| [`print-papelaria`](../skills/print/print-papelaria/SKILL.md) | Brand stationery: business card, letterhead, envelope, folder and e-mail signature, with per-person data in batch. |
| [`print-apresentacao`](../skills/print/print-apresentacao/SKILL.md) | A 16:9 presentation in InDesign: one idea per slide, grid, styles, master pages per slide type, and PDFs for screen and print. |

## Motion

Animation in After Effects.

| Skill | Purpose |
|---|---|
| [`motion-fundamentos`](../skills/motion/motion-fundamentos/SKILL.md) | The required flow and craft rules for any animation: save and inspect, timing in frames, easing with meaning, choreography, reading time. |
| [`motion-direcao-de-arte`](../skills/motion/motion-direcao-de-arte/SKILL.md) | Defining the language of movement before animating: tone and energy, durations, easing family, transition family, stagger and hierarchy. |
| [`motion-estilos`](../skills/motion/motion-estilos/SKILL.md) | Creating a library of named motion styles so every animation of a brand looks like the same family. |
| [`motion-continuidade`](../skills/motion/motion-continuidade/SKILL.md) | Animating without "slide changes": each change keeps one element alive that transforms into the next moment. |
| [`motion-tipografia-cinetica`](../skills/motion/motion-tipografia-cinetica/SKILL.md) | Animating text as performance: phrases with the rhythm of speech, reveals by word or line, emphasis on the key word. |
| [`motion-legendas-dinamicas`](../skills/motion/motion-legendas-dinamicas/SKILL.md) | Dynamic captions and impact text for short video, with a catalogue of creator styles and highlight behaviours for the spoken word. |
| [`motion-lyric-video`](../skills/motion/motion-lyric-video/SKILL.md) | Lyric videos and kinetic type synced to the beat, where each word lands on time and the camera keeps travelling. |
| [`motion-logo-e-vinheta`](../skills/motion/motion-logo-e-vinheta/SKILL.md) | Logo animation and opening or closing stings built from the geometry of the mark, with background and transparent versions. |
| [`motion-post-animado`](../skills/motion/motion-post-animado/SKILL.md) | Turning static artwork into an animated post: import the layers, keep text editable, add parallax and short reveals, loop or hold. |
| [`motion-graficos-de-video`](../skills/motion/motion-graficos-de-video/SKILL.md) | Reusable video graphics (lower third, title, call-to-action card, counter) with boxes that fit the text, exported as templates for Premiere. |
| [`motion-transicoes`](../skills/motion/motion-transicoes/SKILL.md) | A kit of brand transitions and the rules for when not to use one. |

## Video

Editing in Premiere Pro.

| Skill | Purpose |
|---|---|
| [`video-reels`](../skills/video/video-reels/SKILL.md) | Short vertical video: hook in two seconds, cadence by shot type, punch-ins, B-roll, pattern breaks and graphics from After Effects. |
| [`video-ugc`](../skills/video/video-ugc/SKILL.md) | Creator-style video for ads and organic posts: early hook, hard cuts, large word-by-word captions, emphasis zooms and product B-roll. |
| [`video-anuncio`](../skills/video/video-anuncio/SKILL.md) | Short ad videos of 6, 15 and 30 seconds: one message, brand early, offer and call to action at the end, versions per ratio and per hook. |
| [`video-vsl`](../skills/video/video-vsl/SKILL.md) | Sales videos and long talking pieces: transcription, removing pauses and stumbles, blocks from the script, B-roll, proof screens and chapters. |
| [`video-fala-limpa`](../skills/video/video-fala-limpa/SKILL.md) | Editing recorded speech: transcription, take selection, cuts in the silences, breaths, levels, J and L cuts and a checklist per edit point. |
| [`video-legendas-e-som`](../skills/video/video-legendas-e-som/SKILL.md) | Captions and audio: caption size, words per line and timing, music under voice, ducking, sound effects and loudness per platform. |
| [`video-cor-e-export`](../skills/video/video-cor-e-export/SKILL.md) | Colour and export: correction before the look, matching shots, and delivery settings per platform. |

## Scripts

Writing what will be shot, animated or laid out.

| Skill | Purpose |
|---|---|
| [`roteiro-reels-shorts`](../skills/roteiros/roteiro-reels-shorts/SKILL.md) | A short vertical video script: hook, structure, word budget, on-screen text, shot and B-roll lists, and hook variations for testing. |
| [`roteiro-anuncio-video`](../skills/roteiros/roteiro-anuncio-video/SKILL.md) | Video ad scripts in 6, 15 and 30 second versions per angle, with interchangeable hooks and on-screen text that works without sound. |
| [`roteiro-ugc`](../skills/roteiros/roteiro-ugc/SKILL.md) | A creator-style script (review, unboxing, tutorial, before and after) in bullet points so it sounds natural, with a shot list. |
| [`roteiro-vsl`](../skills/roteiros/roteiro-vsl/SKILL.md) | A sales video script from hook to call to action, with screen markings and the cuts to derive for ads. |
| [`roteiro-institucional-depoimento`](../skills/roteiros/roteiro-institucional-depoimento/SKILL.md) | Company videos, case studies and testimonials: structure in acts, interview questions that produce usable lines, B-roll list and releases. |
| [`roteiro-carrossel`](../skills/roteiros/roteiro-carrossel/SKILL.md) | A carousel script: a cover that stops the scroll, one idea per slide, a slide worth saving and a call to action. |
| [`roteiro-storyboard`](../skills/roteiros/roteiro-storyboard/SKILL.md) | A storyboard as a beat sheet: three concepts that differ in idea, and for each moment what moves, what stays and what carries over. |

## Prompts for generative tools

Writing requests for image, video and audio generators and bringing the results into the workflow.

| Skill | Purpose |
|---|---|
| [`prompt-roteamento-modelos`](../skills/prompts/prompt-roteamento-modelos/SKILL.md) | Deciding which generative tool suits each job, the three gates from idea to image to video, and how to spend credits. |
| [`prompt-imagem`](../skills/prompts/prompt-imagem/SKILL.md) | A structured image prompt: subject, action, setting, framing, lens, light, palette, texture and style, with a fixed style block for series. |
| [`prompt-video`](../skills/prompts/prompt-video/SKILL.md) | A video prompt: structure first, camera by technique name, action with a physical target, and continuity between scenes. |
| [`prompt-asset-sheets`](../skills/prompts/prompt-asset-sheets/SKILL.md) | Character, location, product and wardrobe sheets as clean input for generated video. |
| [`prompt-broll-metafora`](../skills/prompts/prompt-broll-metafora/SKILL.md) | Turning an abstract line of the script into B-roll: choose the visual metaphor, generate the still, then animate it consistently. |
| [`prompt-musica-voz`](../skills/prompts/prompt-musica-voz/SKILL.md) | The brief for music, voice-over and sound effects: the editorial role of each section, energy, tempo, instruments and tone of voice. |
| [`prompt-diagnostico`](../skills/prompts/prompt-diagnostico/SKILL.md) | Diagnosing a bad generated result: symptom, likely cause and which stage to go back to, instead of re-rolling the same prompt. |

## Quality and delivery

The gates before anything leaves.

| Skill | Purpose |
|---|---|
| [`qa-revisao-visual`](../skills/qa/qa-revisao-visual/SKILL.md) | The exit gate for any piece: check it visually in the app, check brand, facts, format and safe zones, and report what was and was not verified. |
| [`qa-revisao-video`](../skills/qa/qa-revisao-video/SKILL.md) | Reviewing video before delivery: file specifications, key frames, captions against the audio, names and numbers, loudness, safe zones and rights. |
| [`qa-anti-generico`](../skills/qa/qa-anti-generico/SKILL.md) | Reviewing copy and visuals against the marks of generic or template-looking work: empty phrases, clichés, default gradients, stock imagery. |
| [`qa-preflight-entrega`](../skills/qa/qa-preflight-entrega/SKILL.md) | Closing and delivering a job: folder structure, names and versions, editable files saved, outputs per channel, contact sheet and an honest report. |
| [`ops-recuperacao`](../skills/qa/ops-recuperacao/SKILL.md) | What to do when an app hangs, times out or returns an error: diagnosis, what never to repeat, and how to resume without losing work. |

## Apps and pipelines

How each app behaves through the server, and how work moves between them.

| Skill | Purpose |
|---|---|
| [`app-photoshop`](../skills/app/app-photoshop/SKILL.md) | The Photoshop contract: bridges, units and colours, which tool to use for what, what needs a free script, and known traps. |
| [`app-illustrator`](../skills/app/app-illustrator/SKILL.md) | The Illustrator contract: coordinate system, units, colours, the decision tree of the tools and what needs a free script. |
| [`app-indesign`](../skills/app/app-indesign/SKILL.md) | The InDesign contract: units per call, type always in points, styles before text, links, effects, tables, preflight and PDF. |
| [`app-lightroom`](../skills/app/app-lightroom/SKILL.md) | The Lightroom Classic contract: photos by id, implicit selection, everything non-destructive, develop keys and what needs a free script. |
| [`app-after-effects`](../skills/app/app-after-effects/SKILL.md) | The After Effects contract: colours from 0 to 1, time in seconds, indices from 1, property paths, and safe free scripts. |
| [`app-premiere`](../skills/app/app-premiere/SKILL.md) | The Premiere Pro contract: seconds in the tools and ticks in scripts, indices from 0, effect names in the app's language, captions and project lock. |
| [`app-code-mode`](../skills/app/app-code-mode/SKILL.md) | When to replace a sequence of calls with one script, how to read signatures, run in the background and handle errors. |
| [`pipeline-entre-apps`](../skills/app/pipeline-entre-apps/SKILL.md) | Passing work between the six apps in a campaign: order of the apps, format of each hand-off, links instead of copies. |
| [`pipeline-ia-externa`](../skills/app/pipeline-ia-externa/SKILL.md) | Bringing generated images, video and audio into the workflow: request, receive, check, name, record the origin and treat in the apps. |

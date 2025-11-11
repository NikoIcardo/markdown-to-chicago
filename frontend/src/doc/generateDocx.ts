import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type {
  Content,
  Heading,
  Image as MdImage,
  List,
  ListItem,
  Parent,
  Root,
} from 'mdast'
import { toString } from 'mdast-util-to-string'
import type { ProcessedMarkdown } from '../utils/types'

const markdownParser = unified().use(remarkParse).use(remarkGfm)

const headingLevelMap = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

function convertHeading(node: Heading): Paragraph {
  return new Paragraph({
    text: toString(node),
    heading: headingLevelMap[node.depth] ?? HeadingLevel.HEADING_6,
  })
}

function convertParagraph(node: Content): Paragraph {
  return new Paragraph({
    text: toString(node),
  })
}

function convertList(list: List): Paragraph[] {
  return list.children.map((item, index) => {
    const listItem = item as ListItem
    const prefix = list.ordered ? `${(list.start ?? 1) + index}. ` : '• '
    return new Paragraph({
      text: `${prefix}${toString(listItem)}`,
    })
  })
}

function convertBlockquote(node: Parent): Paragraph[] {
  return [
    new Paragraph({
      text: toString(node),
      indent: { left: 720 },
    }),
  ]
}

function convertImage(node: MdImage): Paragraph[] {
  const description = node.alt || node.title || 'Image'
  return [
    new Paragraph({
      text: `Image: ${description} (${node.url})`,
    }),
  ]
}

function convertNode(node: Content): Paragraph[] {
  switch (node.type) {
    case 'heading':
      return [convertHeading(node as Heading)]
    case 'paragraph':
      return [convertParagraph(node)]
    case 'list':
      return convertList(node as List)
    case 'blockquote':
      return convertBlockquote(node as Parent)
    case 'code':
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: (node as any).value,
              font: 'Courier New',
            }),
          ],
        }),
      ]
    case 'html':
      return [convertParagraph(node)]
    case 'image':
      return convertImage(node as MdImage)
    case 'thematicBreak':
      return [new Paragraph({ text: '' })]
    default:
      if ('children' in node && Array.isArray((node as Parent).children)) {
        return (node as Parent).children.flatMap((child) => convertNode(child as Content))
      }
      return []
  }
}

export async function generateDocx(processed: ProcessedMarkdown): Promise<Blob> {
  const ast = markdownParser.parse(processed.modified) as Root
  const children: Paragraph[] = []
  ast.children.forEach((child) => {
    children.push(...convertNode(child as Content))
  })

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children.length ? children : [new Paragraph('')],
      },
    ],
  })

  return Packer.toBlob(doc)
}

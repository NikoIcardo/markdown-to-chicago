import { Document, ExternalHyperlink, HeadingLevel, InternalHyperlink, Packer, Paragraph, TextRun, AlignmentType } from 'docx'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import type {
  Content,
  Heading,
  Image as MdImage,
  Link,
  List,
  ListItem,
  Parent,
  Paragraph as MdParagraph,
  Root,
  Text,
} from 'mdast'
import { toString } from 'mdast-util-to-string'
import type { ProcessedMarkdown } from '../utils/types'

const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter)

const headingLevelMap = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

function convertInlineNodes(nodes: Content[]): (TextRun | ExternalHyperlink | InternalHyperlink)[] {
  const result: (TextRun | ExternalHyperlink | InternalHyperlink)[] = []
  
  nodes.forEach((node) => {
    if (node.type === 'text') {
      result.push(new TextRun((node as Text).value))
    } else if (node.type === 'link') {
      const linkNode = node as Link
      const linkText = toString(linkNode)
      
      if (linkNode.url.startsWith('#')) {
        // Internal link (bibliography reference)
        const anchorId = linkNode.url.substring(1) // Remove the #
        result.push(
          new InternalHyperlink({
            children: [new TextRun({ text: linkText, superScript: true, style: 'Hyperlink' })],
            anchor: anchorId,
          })
        )
      } else {
        // External link
        result.push(
          new ExternalHyperlink({
            children: [new TextRun({ text: linkText, style: 'Hyperlink' })],
            link: linkNode.url,
          })
        )
      }
    } else if (node.type === 'strong') {
      const strongText = toString(node)
      result.push(new TextRun({ text: strongText, bold: true }))
    } else if (node.type === 'emphasis') {
      const emphasisText = toString(node)
      result.push(new TextRun({ text: emphasisText, italics: true }))
    } else if (node.type === 'inlineCode') {
      result.push(
        new TextRun({
          text: (node as any).value,
          font: 'Courier New',
        })
      )
    } else if ('children' in node) {
      result.push(...convertInlineNodes((node as Parent).children as Content[]))
    }
  })
  
  return result
}

function convertHeading(node: Heading): Paragraph {
  return new Paragraph({
    children: convertInlineNodes(node.children as Content[]),
    heading: headingLevelMap[node.depth] ?? HeadingLevel.HEADING_6,
  })
}

function convertParagraph(node: MdParagraph): Paragraph {
  return new Paragraph({
    children: convertInlineNodes(node.children as Content[]),
  })
}

function convertList(list: List): Paragraph[] {
  return list.children.map((item, index) => {
    const listItem = item as ListItem
    const prefix = list.ordered ? `${(list.start ?? 1) + index}. ` : '• '
    
    // Get inline content from the list item
    const inlineContent: (TextRun | ExternalHyperlink | InternalHyperlink)[] = []
    listItem.children.forEach((child) => {
      if (child.type === 'paragraph') {
        inlineContent.push(...convertInlineNodes((child as MdParagraph).children as Content[]))
      } else {
        inlineContent.push(new TextRun(toString(child)))
      }
    })
    
    return new Paragraph({
      children: [new TextRun(prefix), ...inlineContent],
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
      return [convertParagraph(node as MdParagraph)]
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
      // Skip HTML nodes as they're handled inline
      return []
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
  
  // Remove YAML frontmatter from AST before building content
  ast.children = ast.children.filter((node) => node.type !== 'yaml')
  
  const title = processed.title || 'Untitled Document'
  const subtitle = processed.subtitle
  
  // Title page
  const titlePage: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          size: 56, // 28pt
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 4000, after: 400 },
    }),
  ]
  
  // Add subtitle if available
  if (subtitle) {
    titlePage.push(
      new Paragraph({
        children: [
          new TextRun({
            text: subtitle,
            size: 32, // 16pt
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    )
  }
  
  // Add page break after title page
  titlePage.push(
    new Paragraph({
      children: [new TextRun({ text: '', break: 1 })],
      pageBreakBefore: true,
    })
  )
  
  // Content pages
  const contentPages: Paragraph[] = []
  ast.children.forEach((child) => {
    contentPages.push(...convertNode(child as Content))
  })

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [...titlePage, ...contentPages],
      },
    ],
  })

  return Packer.toBlob(doc)
}

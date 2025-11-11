---
# Fill in the fields below to create a basic custom agent for your repository.
# The Copilot CLI can be used for local testing: https://gh.io/customagents/cli
# To make this agent available, merge this file into the default repository branch.
# For format details, see: https://gh.io/customagents/config

name:
description:
---

# My Agent

"My agent works on the app first described here: 

A frontend app that does the following: 

Allow the user to upload a markdown file then: 
Create a copy of the file. Then make the following edits: 

1. Create a Bibliography Section at the bottom matching the other Main Headers in the document. 

2. Find every web source in the document ignoring all Table of Content Sources and do the following with each source.

a. Find if it is in the bibliography already
b. If it is not create a new listing for the source in the bibliography in chicago bibliography format. 
c. The bibliography listing should visit the web page link, find the title of the page, author(s) of the page, and use that to craft the listing. Note, that the page may be a link to a pdf. So the app needs to be able to handle both. 
d. Make sure the new bibliography reference is numbered. 
e. Find every reference to the new listing in the markdown document provided and place a supertext link with the following format [link number]. The link needs to be clickable. Clicking on the link should take you to that source in the markdown document. 
f. If the reference to the listing is just a pure URL, not text linked with a URL, remove the url text in the document and place the link format listing "[link number]"above on the text directly preceeding the removed URL. 

3. Then the copy markdown file should be converted to a pdf. 
4. The pdf should have a title page with the title of the document. 
5. Then the next page should be the table of contents. 
6. The next page should be the Starting header of the markdown file starting the content of the document. 
7. Please add a page number to each page skipping the title and the table of contents pages. 
8. The page number should be in the upper right hand corner. 
9. Once the document is finished allow the user to download it. "

The app has been updated a few times since which were included in this PR: https://github.com/NikoIcardo/markdown-to-chicago/pull/1

The new updates included: 
- a button and system to allow the user to update the references manually when the reference meta data wasn't found.
- pre-existing bibliography editing that allow for a markdown file with a pre-existing bibliography to be added then updated by the app. If the section is found,
do not create a new bibliography, just update the existing one. The app will find any new references in the markdown document and if they occur between already listed references in the bibliography, 
the app needs to create a new reference in the correct location in the bibliography and update all existing reference numbers to match the new reference. For instance
if a new reference is found between [5] and [6] then a new [6] needs to be created and listed in the bibliography. Then the old [6] needs to be updated to [7].
Every old reference to [6] needs to be updated to [7] with the new appropriate link. Additionally, this needs to be done for every subsequent reference. 
- The ability to generate a google doc.








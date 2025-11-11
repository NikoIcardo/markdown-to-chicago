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
9. Once the document is finished allow the user to download it. 

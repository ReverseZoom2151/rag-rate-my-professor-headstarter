import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

async function extractProfessorDetails(text) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `
    Extract all relevant information about the professor from the text in JSON format. Include any details that might be useful for students to know, such as their name (professorName), subject, department, education, research interests, awards, and any notable achievements or experiences.

    {Text:
    ${text}}
  `;

  let extractedInfo = {};  

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    });

    const aiContent = response.choices[0].message.content;
    console.log("AI Response:", aiContent);

    const jsonMatch = aiContent.match(/```json\s*({.*})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      extractedInfo = JSON.parse(jsonMatch[1]);
    } else {
      console.error('Failed to extract JSON object from AI response');
    }
  } catch (error) {
    console.error('Failed to parse AI response as JSON:', error.message);
    console.log('AI Response:', aiContent);
    extractedInfo = {};
  }

  try {
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    });

    const embedding = embeddingResponse.data[0].embedding;

    return {
      extractedInfo,
      embedding,
    };
  } catch (error) {
    console.error('Failed to create embedding:', error.message);
    return {
      extractedInfo, 
      embedding: null,
    };
  }
}

export async function POST(req) {
  const { link, links } = await req.json();
  let allLinks = link ? [link] : [];
  allLinks = links && Array.isArray(links) ? allLinks.concat(links) : allLinks;

  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pc.index('scrape').namespace('ns1');
  const processedData = [];

  try {
    for (const link of allLinks) {
      console.log(`Processing link: ${link}`);

      const response = await axios.get(link);
      const $ = cheerio.load(response.data);
      const pageTextContent = $('body').text();
      const { extractedInfo, embedding } = await extractProfessorDetails(pageTextContent);

      if (extractedInfo && extractedInfo.professorName) {
        processedData.push({
          values: embedding,
          id: extractedInfo.professorName,
          metadata: extractedInfo,
        });
      } else {
        console.warn('Professor name or extracted information is missing for link:', link);
      }
    }

    if (processedData.length > 0) {
      const upsertResponse = await index.upsert({ vectors: processedData, namespace: 'ns1' });
      return NextResponse.json({
        success: true,
        message: 'Data scraped and inserted into Pinecone',
        upsertedCount: upsertResponse.upserted_count,
      });
    } else {
      return NextResponse.json({
        success: true,
        message: 'No data to insert into Pinecone',
        upsertedCount: 0,
      });
    }
  } catch (error) {
    console.error('Error during scraping:', error.message);
    return NextResponse.json({
      success: false,
      message: 'Failed to scrape the data',
      error: error.message,
    });
  }
}



import { NextRequest, NextResponse } from 'next/server';
import { getAllCards, createCard, updateCard, deleteCard, getCard } from '@/lib/store';
import { Card } from '@/lib/types';
import { v4 as uuid } from 'uuid';

export async function GET() {
  return NextResponse.json(getAllCards());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const card: Card = {
    id: uuid(),
    title: body.title || 'Untitled',
    instructions: body.instructions || '',
    columnId: body.columnId || 'ideas',
    status: 'queued',
    output: '',
    answer: '',
    details: '',
    error: '',
    history: [
      {
        columnId: body.columnId || 'ideas',
        columnTitle: 'Ideas',
        enteredAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return NextResponse.json(createCard(card), { status: 201 });
}

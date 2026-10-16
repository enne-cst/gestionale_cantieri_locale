import React from 'react';
import { Composition } from 'remotion';
import { Promo, DURATA, FPS } from './Promo';

export const Root = () => (
  <Composition id="Promo" component={Promo} durationInFrames={DURATA} fps={FPS} width={1920} height={1080} />
);

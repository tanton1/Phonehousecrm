import React from 'react';
import { MasterCatalogItem } from '../types';
import { CatalogCenterView } from './CatalogCenterView';

interface MasterCatalogViewProps {
  /** Legacy compatibility input. CatalogCenter loads its own paginated data. */
  items?: MasterCatalogItem[];
}

export const MasterCatalogView: React.FC<MasterCatalogViewProps> = ({
  items = []
}) => {
  return <CatalogCenterView items={items} />;
};

export type InsightDashboardResponse = {
  sales: {
    forecast: number;
    lastWeek: number;
    diff: number;
  };

  weather: {
    condition: string;
    rainProbability: number;
    temperature: number;
    warningTime?: string;
  };

  shift: {
    submitted: number;
    total: number;
    rate: number;

    employees: {
      employeeId: string;
      employeeName: string;

      badges: string[];

      submitted: boolean;

      nextTraining?: string;
    }[];
  };

  inventory: {
    risks: {
      itemCode: string;
      itemName: string;

      currentQty: number;
      orderedQty: number;

      predictedUsage: number;

      predictedRemaining: number;

      level: 'high' | 'medium' | 'low';
    }[];
  };

  alerts: {
    level: 'high' | 'medium' | 'low';

    category:
      | 'sales'
      | 'weather'
      | 'shift'
      | 'inventory';

    message: string;
  }[];
};
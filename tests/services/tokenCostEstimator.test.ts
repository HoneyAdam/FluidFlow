/**
 * Token Cost Estimator - Full Test Suite
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCost,
  getModelPricing,
  formatCost,
  MODEL_PRICING,
  type CostEstimate,
  type ModelPricing,
} from '../../services/tokenCostEstimator';

describe('Token Cost Estimator', () => {
  describe('calculateCost', () => {
    it('should calculate cost for GPT-4o', () => {
      const result = calculateCost('gpt-4o', 1000000, 1000000);

      expect(result.inputCost).toBe(5); // $5 per 1M input
      expect(result.outputCost).toBe(15); // $15 per 1M output
      expect(result.totalCost).toBe(20);
      expect(result.currency).toBe('USD');
    });

    it('should calculate cost for GPT-4o-mini', () => {
      const result = calculateCost('gpt-4o-mini', 1000000, 1000000);

      expect(result.inputCost).toBe(0.15);
      expect(result.outputCost).toBe(0.60);
      expect(result.totalCost).toBe(0.75);
    });

    it('should calculate cost for Claude 3.5 Sonnet', () => {
      const result = calculateCost('claude-3.5-sonnet-20250219', 1000000, 1000000);

      expect(result.inputCost).toBe(3);
      expect(result.outputCost).toBe(15);
      expect(result.totalCost).toBe(18);
    });

    it('should calculate cost for Gemini 2.0 Flash', () => {
      const result = calculateCost('gemini-2.0-flash-exp', 1000000, 1000000);

      expect(result.inputCost).toBe(0.1);
      expect(result.outputCost).toBe(0.1);
      expect(result.totalCost).toBe(0.2);
    });

    it('should calculate for custom token amounts', () => {
      const result = calculateCost('gpt-4o', 1000, 500);

      expect(result.inputCost).toBe(0.005);
      expect(result.outputCost).toBe(0.0075);
    });

    it('should use openrouter default for unknown model', () => {
      const result = calculateCost('unknown-model', 1000000, 1000000);

      expect(result.inputCost).toBe(1);
      expect(result.outputCost).toBe(2);
      expect(result.totalCost).toBe(3);
    });

    it('should calculate cost using openrouter default for unknown model', () => {
      // Unknown model uses openrouter defaults: $1/M input, $2/M output
      const result = calculateCost('truly-unknown-model', 100, 100);
      expect(result.totalCost).toBeCloseTo(0.0003, 4);
    });
  });

  describe('getModelPricing', () => {
    it('should return pricing for known models', () => {
      const pricing = getModelPricing('gpt-4o');

      expect(pricing).not.toBeNull();
      expect(pricing?.inputPricePer1M).toBe(5);
      expect(pricing?.outputPricePer1M).toBe(15);
    });

    it('should return null for unknown model', () => {
      const pricing = getModelPricing('completely-unknown-model');

      expect(pricing).toBeNull();
    });

    it('should include currency in pricing', () => {
      const pricing = getModelPricing('gpt-4o');

      expect(pricing?.currency).toBe('USD');
    });
  });

  describe('formatCost', () => {
    it('should format cost less than $0.01', () => {
      const formatted = formatCost(0.001);

      expect(formatted).toBe('< $0.01');
    });

    it('should format cost of $0.01', () => {
      const formatted = formatCost(0.01);

      expect(formatted).toBe('$0.0100');
    });

    it('should format cost greater than $0.01', () => {
      const formatted = formatCost(1.5);

      expect(formatted).toBe('$1.5000');
    });

    it('should handle zero cost', () => {
      const formatted = formatCost(0);

      expect(formatted).toBe('< $0.01');
    });
  });

  describe('MODEL_PRICING', () => {
    it('should have OpenAI models', () => {
      expect(MODEL_PRICING['gpt-4o']).toBeDefined();
      expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
      expect(MODEL_PRICING['gpt-4-turbo']).toBeDefined();
    });

    it('should have Anthropic models', () => {
      expect(MODEL_PRICING['claude-3.5-sonnet-20250219']).toBeDefined();
      expect(MODEL_PRICING['claude-3-opus-20250219']).toBeDefined();
    });

    it('should have Google Gemini models', () => {
      expect(MODEL_PRICING['gemini-2.0-flash-exp']).toBeDefined();
      expect(MODEL_PRICING['gemini-2.5-pro']).toBeDefined();
    });

    it('should have ZAI models', () => {
      expect(MODEL_PRICING['glm-4.7']).toBeDefined();
      expect(MODEL_PRICING['glm-4.6']).toBeDefined();
    });

    it('should have OpenRouter default', () => {
      expect(MODEL_PRICING['openrouter']).toBeDefined();
    });
  });

  describe('CostEstimate type', () => {
    it('should have all required properties', () => {
      const cost: CostEstimate = {
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        inputCost: 0.005,
        outputCost: 0.0075,
        totalCost: 0.0125,
        currency: 'USD',
      };

      expect(cost.model).toBe('gpt-4o');
      expect(cost.inputTokens).toBe(1000);
      expect(cost.outputTokens).toBe(500);
      expect(cost.totalCost).toBe(0.0125);
    });
  });

  describe('ModelPricing type', () => {
    it('should have all required properties', () => {
      const pricing: ModelPricing = {
        inputPricePer1M: 5,
        outputPricePer1M: 15,
        currency: 'USD',
      };

      expect(pricing.inputPricePer1M).toBe(5);
      expect(pricing.outputPricePer1M).toBe(15);
      expect(pricing.currency).toBe('USD');
    });
  });
});
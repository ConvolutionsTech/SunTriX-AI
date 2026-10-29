import { describe, it, expect } from "vitest";
import { TaskStatusMachine } from "../services/taskStatusMachine";

describe("2.1 TaskStatusMachine Unit Tests", () => {
  describe("Valid Transitions", () => {
    it("should allow valid sequential transitions by admin", () => {
      expect(TaskStatusMachine.isValidTransition("new", "in_review", "admin")).toBe(true);
      expect(TaskStatusMachine.isValidTransition("in_review", "proposal_sent", "admin")).toBe(true);
      expect(TaskStatusMachine.isValidTransition("proposal_sent", "contract_sent", "admin")).toBe(true);
      expect(TaskStatusMachine.isValidTransition("contract_sent", "contract_signed", "admin")).toBe(true);
      expect(TaskStatusMachine.isValidTransition("contract_signed", "in_progress", "admin")).toBe(true);
      expect(TaskStatusMachine.isValidTransition("in_progress", "completed", "admin")).toBe(true);
    });

    it("should allow cancellation from any active state", () => {
      expect(TaskStatusMachine.isValidTransition("new", "cancelled", "admin")).toBe(true);
      expect(TaskStatusMachine.isValidTransition("in_review", "cancelled", "admin")).toBe(true);
      expect(TaskStatusMachine.isValidTransition("proposal_sent", "cancelled", "admin")).toBe(true);
      expect(TaskStatusMachine.isValidTransition("in_progress", "cancelled", "admin")).toBe(true);
    });
  });

  describe("Invalid Transitions", () => {
    it("should reject invalid state jumps", () => {
      expect(TaskStatusMachine.isValidTransition("new", "completed", "admin")).toBe(false);
      expect(TaskStatusMachine.isValidTransition("new", "in_progress", "admin")).toBe(false);
      expect(TaskStatusMachine.isValidTransition("proposal_sent", "completed", "admin")).toBe(false);
      expect(TaskStatusMachine.isValidTransition("completed", "in_review", "admin")).toBe(false);
      expect(TaskStatusMachine.isValidTransition("completed", "in_progress", "admin")).toBe(false);
      expect(TaskStatusMachine.isValidTransition("cancelled", "in_progress", "admin")).toBe(false);
    });

    it("should reject unauthorized actor transitions", () => {
      // Client cannot start work, and can only complete a project that is in progress (final sign-off)
      expect(TaskStatusMachine.isValidTransition("contract_signed", "in_progress", "client")).toBe(false);
      expect(TaskStatusMachine.isValidTransition("contract_signed", "completed", "client")).toBe(false);
      expect(TaskStatusMachine.isValidTransition("in_progress", "completed", "client")).toBe(true);
    });
  });
});

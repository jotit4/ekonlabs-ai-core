from typing import Annotated, Literal
from typing_extensions import TypedDict, NotRequired
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class ConversationState(TypedDict):
    tenant_id: str          # OBLIGATORIO en todo estado
    phone_number: str
    messages: Annotated[list[BaseMessage], add_messages]  # add_messages: reducer LangGraph 1.x (agrega, no sobreescribe)
    confidence_score: NotRequired[float]
    is_paused: NotRequired[bool]
    rag_context: NotRequired[str]   # Set by rag_retrieval_node; absent until that node runs
    system_prompt: NotRequired[str] # Populado por el worker desde get_tenant_config().system_prompt_override
    empathy_mode: NotRequired[Literal["normal", "urgent"]]  # Set by triage_node; absent = "normal" (default)
    is_medical_query: NotRequired[bool]  # Set by anti_diagnostic_node; absent = False (default)
    scheduling_intent: NotRequired[bool]   # Set by scheduling_node; absent = False (default)
    available_slots: NotRequired[list[dict]]  # Set by scheduling_node; list of {start, end, display}
    shadow_mode_active: NotRequired[bool]      # Set by scheduling_node/booking_node when shadow_mode_enabled=True
    booking_intent: NotRequired[bool]          # Set by booking_node; absent = False (default)
    booking_action: NotRequired[str]           # "confirm" | "cancel"; set by booking_node
    booked_slot: NotRequired[dict]             # The confirmed slot {start, end, display}
    calendar_event_id: NotRequired[str | None] # event_id returned by create_event / found by find_event_by_phone
    selected_slot_index: NotRequired[int]      # 0, 1 or 2 — which option the patient chose
    booking_ambiguous_slot: NotRequired[bool]  # Set by booking_node when slot selection is ambiguous; triggers clarification in generation_node
    # Phase 15 — Patient name collection
    patient_name: NotRequired[str | None]          # Patient's full name once captured; absent = not yet collected
    name_collection_active: NotRequired[bool]       # True while agent is waiting for patient to provide name
    slot_presented_at: NotRequired[str | None]      # ISO timestamp when slots were presented; used for 30-min TTL check
    name_attempts: NotRequired[int]                 # Times agent has asked for patient name; absent = 0
    # v1.3 — Multi-servicio
    selected_service_id: NotRequired[str | None]    # UUID del servicio seleccionado por el paciente
    selected_service_name: NotRequired[str | None]  # Nombre del servicio (para display y título de evento)
    service_selection_pending: NotRequired[bool]    # True cuando el agente debe preguntar qué servicio quiere el paciente
    # v1.4 — Registro de pacientes
    patient_dni: NotRequired[str | None]            # DNI una vez capturado; None = no recolectado aún
    dni_collection_active: NotRequired[bool]        # True mientras el agente espera que el paciente dé su DNI
    dni_attempts: NotRequired[int]                  # Veces que el agente pidió el DNI; ausente = 0
    patient_id: NotRequired[str | None]             # UUID del registro en tabla patients
    # F0.3 — Consent (Ley 25.326)
    consent_given: NotRequired[bool]         # True once patient has given or already had active consent
    # Booking rules por servicio (migration 006)
    walk_in_service: NotRequired[bool]              # True si el servicio es solo por orden de llegada (sin turno)
    gated_service_active: NotRequired[bool]         # True si el servicio requiere consulta médica previa
    gated_service_name: NotRequired[str | None]     # Nombre del servicio gated que el paciente quiere
    gated_prerequisite_note: NotRequired[str | None] # Texto del requisito previo para mostrar al paciente
    # Servicios por ciclo / inscripción (Pilates, Aquagym) — F-ISADI-1
    cycle_service_active: NotRequired[bool]          # True cuando el servicio solicitado es por ciclo
    cycle_service_name: NotRequired[str | None]      # Nombre del servicio de ciclo
    cycle_service_info: NotRequired[str | None]      # Info de horarios/profesor/capacidad inyectada al LLM
    # Captura extendida de datos del paciente (F-ISADI-3)
    extended_collection_active: NotRequired[bool]    # True mientras se recolectan OS/motivo/tel alt/dirección
    extended_attempts: NotRequired[int]              # Intentos de captura extendida; ausente = 0
    patient_obra_social: NotRequired[str | None]     # Nombre OS o "particular"; None = no capturado
    patient_obra_social_number: NotRequired[str | None]  # Número de afiliado; None = no capturado
    patient_motivo: NotRequired[str | None]          # Motivo de consulta / diagnóstico
    patient_alt_phone: NotRequired[str | None]       # Teléfono alternativo de contacto
    patient_address: NotRequired[str | None]         # Dirección del paciente

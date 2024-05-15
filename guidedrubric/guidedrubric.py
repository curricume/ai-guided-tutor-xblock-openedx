"""TO-DO: Write a description of what this XBlock is."""

from typing_extensions import override
from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db.models import Q
from django.utils.module_loading import import_string
from webob import Response
from six import string_types
from web_fragments.fragment import Fragment
from xblock.core import XBlock
from xblock.fields import Scope, String, Float, Boolean, Dict, DateTime, Integer
import zipfile
import os
import logging
import pkg_resources
import openai
from openai import AssistantEventHandler
from dotenv import load_dotenv
import time
import re
import json
from xblock.fields import Scope, String, Integer
from django.template import Context, Template
from xblock.completable import CompletableXBlockMixin
import xml.etree.ElementTree as ET
import logging
from lms.djangoapps.courseware.models import StudentModule
from opaque_keys.edx.keys import UsageKey

logger = logging.getLogger(__name__)

from xblockutils.resources import ResourceLoader
loader = ResourceLoader(__name__)

try:
    try:
        from common.djangoapps.student.models import CourseEnrollment
    except RuntimeError:
        # Older Open edX releases have a different import path
        from student.models import CourseEnrollment
    from lms.djangoapps.courseware.models import StudentModule
except ImportError:
    CourseEnrollment = None
    StudentModule = None



load_dotenv()
client = openai.OpenAI(api_key=settings.FEATURES['OPENAI_SECRET_KEY'])
model = "gpt-4-turbo-preview"

ai_messages = []
ai_grade = []
# First, we create a EventHandler class to define
# how we want to handle the events in the response stream.


def _(text):
    return text

class EventHandler(AssistantEventHandler):    
  def __init__(self, grade=False):
        super().__init__()
        self.grade = grade
  @override
  def on_text_created(self, text) -> None:
    pass
    # print(f"\nassistant > ", end="", flush=True)
      
  @override
  def on_text_delta(self, delta, snapshot):
    if delta.value:
        if self.grade:
            ai_grade.append(delta.value)
        else:
            ai_messages.append(delta.value)
      
  def on_tool_call_created(self, tool_call):
    pass
    # print(f"\nassistant > {tool_call.type}\n", flush=True)
  
  def on_tool_call_delta(self, delta, snapshot):
    if delta.type == 'code_interpreter':
      if delta.code_interpreter.input:
        print(delta.code_interpreter.input, end="", flush=True)
      if delta.code_interpreter.outputs:
        print(f"\n\noutput >", flush=True)
        for output in delta.code_interpreter.outputs:
          if output.type == "logs":
            print(f"\n{output.logs}", flush=True)
 
# Then, we use the `create_and_stream` SDK helper 
# with the `EventHandler` class to create the Run 
# and stream the response.


session_state = {
    "current_question_index": 0,
    "thread_obj": None,
    # Add more session state variables as needed
}

class AssistantManager:
    thread_id = None
    assistant_id = None

    def __init__(self, model: str = model):
        self.client = client
        self.model = model
        self.assistant = None
        self.thread = None
        self.run = None
        self.summary = None

        # Retrieve existing assistant and thread if IDs are already set
        if AssistantManager.assistant_id :
            self.assistant = self.client.beta.assistants.retrieve(
                assistant_id=AssistantManager.assistant_id
            )
        if AssistantManager.thread_id:
            self.thread = self.client.beta.threads.retrieve(
                thread_id=AssistantManager.thread_id
            )

    def create_assistant(self, name, instructions, tools):
        if not self.assistant:
            assistant_obj = self.client.beta.assistants.create(
                name=name, instructions=instructions, tools=tools, model=self.model
            )
            AssistantManager.assistant_id = assistant_obj.id
            self.assistant = assistant_obj
            print(f"AssisID:::: {self.assistant.id}")

    def create_thread(self):
        if not self.thread:
            if session_state['thread_obj']:
                print(f"Grabbing existing thread...")
                thread_obj = session_state['thread_obj']
            else:
                print(f"Creating and saving new thread")
                thread_obj = self.client.beta.threads.create()
                session_state['thread_obj'] = thread_obj

            AssistantManager.thread_id = thread_obj.id
            self.thread = thread_obj
            print(f"ThreadID::: {self.thread.id}")
            return self.thread.id

    def add_message_to_thread(self, role, content):
        if self.thread:
            self.client.beta.threads.messages.create(
                thread_id=self.thread.id, role=role, content=content
            )

    def run_assistant(self, instructions, grade):
        if self.thread and self.assistant:
            try:
                with self.client.beta.threads.runs.create_and_stream(
                    thread_id=self.thread.id,
                    assistant_id=self.assistant.id,
                    instructions=instructions,
                    event_handler=EventHandler(grade=grade),
                ) as stream:
                    stream.until_done()
                    self.run = stream._AssistantEventHandler__current_run
                    self.process_message()
            except Exception as e:
                logging.info(e)
                print(f"Streaming error: {e}")

    def process_message(self):
        if self.thread:
            messages = self.client.beta.threads.messages.list(thread_id=self.thread.id)
            summary = []

            last_message = messages.data[0]
            role = last_message.role
            response = last_message.content[0].text.value
            summary.append(response)

            self.summary = "\n".join(summary)
            
    def call_required_functions(self, required_actions):
        if not self.run:
            return
        tool_outputs = []

        for action in required_actions["tool_calls"]:
            func_name = action["function"]["name"]
            arguments = json.loads(action["function"]["arguments"])

            if func_name == "respond":
                output = respond(structured_response=arguments["structured_response"])
            
                final_str = ""
                for item in output:
                    final_str += "".join(item)

                tool_outputs.append({"tool_call_id": action["id"], "output": final_str})
            else:
                raise ValueError(f"Unknown function: {func_name}")

        print("Submitting outputs back to the Assistant...")
        self.client.beta.threads.runs.submit_tool_outputs(
            thread_id=self.thread.id, run_id=self.run.id, tool_outputs=tool_outputs
        )

    def get_summary(self):
        return self.summary

    def wait_for_completion(self):
        if self.thread and self.run:
            while True:
                time.sleep(5)
                run_status = self.client.beta.threads.runs.retrieve(
                    thread_id=self.thread.id, run_id=self.run.id
                )

                if run_status.status == "completed":
                    self.process_message()
                    break
                elif run_status.status == "requires_action":
                    self.call_required_functions(
                        required_actions=run_status.required_action.submit_tool_outputs.model_dump()
                    )


@XBlock.wants("settings")
@XBlock.wants("user")
class GuidedRubricXBlock(XBlock, CompletableXBlockMixin):
    """
    TO-DO: document what your XBlock does.
    """

    # Fields are defined on the class.  You can access them in your code as
    # self.<fieldname>.

    # TO-DO: delete count, and define your own fields.

    display_name = String(
        display_name = "Guided Rubric",
        default="Guided Rubric",
        scope=Scope.settings
    )

    short_description =  String(
        display_name=_("Short Description"),
        default="Short Description",
        scope=Scope.settings,
        help=_("Short Description")
    )

    phases = String(
        scope=Scope.settings,
        help="The phases to display to a student.",
        default="[]"
    )

    last_phase_id = Integer(
        scope=Scope.settings,
        default=0,
    )


    helper_text = String(
        scope=Scope.content
    )


    last_attempted_phase_id = Integer(
        scope=Scope.user_state,
        default=1,
    )

    open_ai_thread_id = String(
        scope=Scope.user_state,
        default="",
    )

    user_response = Dict(
        scope=Scope.user_state,
        default={},
    )
    
    is_staff = Boolean(
        display_name=_("Is Staff"),
        default=False,
        scope=Scope.settings,
    )

    completion_token = Integer(
        display_name=_("Total Prompt Attempts For User"),
        scope=Scope.user_state,
        default=0,
        help=_("Define how many time a user can make prompts")
    )

    # Non-editable model field for ChatGPT version

    assistant_id = String(
        display_name=_("Assistant ID"),
        help=_("This ID will be auto-generated"),
        default="",
        scope=Scope.settings,
    )

    completion_message =  String(
        display_name=_("Completion Message"),
        help=_("Completion Message"),
        default="",
        scope=Scope.settings,
    )

    max_tokens_per_user = Integer(
        display_name=_("Max Attempts Per User"),
        help=_("Max Tokens Per User"),
        default=0,
        scope=Scope.settings,

    )


    is_last_phase_successful = Boolean(default=True, scope=Scope.user_state)


    @property
    def block_phases(self):
        phases_or_serialized_phases = self.phases

        if phases_or_serialized_phases is None:
            phases_or_serialized_phases = ''

        try:
            phases = json.loads(phases_or_serialized_phases)
        except Exception as e:
            logging.info(e)
            phases = []
        return phases

    

    def user_response_details(self):
        user_response = {}
        for phase_id, response in self.user_response.items():
            phase = self.get_phase(int(phase_id))
            if phase:
                question = phase['phase_question']
                user_response.update({int(phase_id): {'question': question, 'response': response}})
        
        return user_response

    
    def get_next_question(self):
        next_phase_id = self.last_attempted_phase_id
        for item in self.block_phases:
            phase_id = int(item.get('phase_id'))
            if self.is_last_phase_successful:
                if phase_id == next_phase_id:
                    return item.get('phase_question')


    @staticmethod
    def json_response(data):
        return Response(
            json.dumps(data), content_type="application/json", charset="utf8"
        )

    def resource_string(self, path):
        """Handy helper for getting resources from our kit."""
        data = pkg_resources.resource_string(__name__, path)
        return data.decode("utf8")

    def render_template(self, template_path, context):
        template_str = self.resource_string(template_path)
        template = Template(template_str)
        return template.render(Context(context))

    
    
    
    # TO-DO: change this view to display your data your own way.
    def studio_view(self, context=None):
        studio_context = {
            "field_assistant_id": self.fields["assistant_id"],
            "field_display_name": self.fields["display_name"],
            "field_short_description": self.fields["short_description"],
            "field_completion_message": self.fields["completion_message"],
            "field_completion_token": self.fields["completion_token"],
            "field_max_tokens_per_user": self.fields["max_tokens_per_user"],
            "guided_rubric_xblock": self
            
        }

        studio_context.update(context or {})
        template = self.render_template("static/html/studio.html", studio_context)
        frag = Fragment(template)
        frag.add_css(self.resource_string("static/css/studio.css"))
        frag.add_javascript(self.resource_string("static/js/src/studio.js"))
        frag.initialize_js('GuidedRubricXBlock')
        return frag
    
    @staticmethod
    def json_response(data):
        return Response(
            json.dumps(data), content_type="application/json", charset="utf8"
        )

    @XBlock.handler
    def studio_submit(self, request, _suffix):
        self.phases = json.dumps(json.loads(request.params['phases']))
        self.last_phase_id = request.params["last_phase_id"]
        self.completion_message = request.params["completion_message"]
        self.max_tokens_per_user = request.params["max_tokens_per_user"]
        self.assistant_id = request.params["assistant_id"]
        self.display_name = request.params["display_name"]
        self.short_description = request.params["short_description"]

        response = {"result": "success", "errors": []}
        return self.json_response(response)


    def get_phase(self, phase_id):
        for item in self.block_phases:
            if int(item.get('phase_id')) == phase_id:
                return item
    
    def get_next_phase_id(self):
        for item in self.block_phases:
            phase_id = int(item.get('phase_id'))
            if phase_id != int(self.last_attempted_phase_id) and phase_id > int(self.last_attempted_phase_id):
                return phase_id
    


        
    def scorm_location(self):
        """
        Unzipped files will be stored in a media folder with this name, and thus
        accessible at a url with that also includes this name.
        """

        default_scorm_location = "guided-rubric"
        return self.xblock_settings.get("LOCATION", default_scorm_location)

    
    @XBlock.handler
    def scorm_search_students(self, data, _suffix):
        """
        Search enrolled students by username/email.
        """
        query = data.params.get("id", "")
        enrollments = (
            CourseEnrollment.objects.filter(
                is_active=True,
                course=self.runtime.course_id,
            )
            .select_related("user")
            .order_by("user__username")
        )
        if query:
            enrollments = enrollments.filter(
                Q(user__username__startswith=query) | Q(user__email__startswith=query)
            )
        # The format of each result is dictated by the autocomplete js library:
        # https://github.com/dyve/jquery-autocomplete/blob/master/doc/jquery.autocomplete.txt
        return self.json_response(
            [
                {
                    "data": {"student_id": enrollment.user.id},
                    "value": f"{enrollment.user.username} ({enrollment.user.email})"
                }
                for enrollment in enrollments[:20]
            ]
        )

    @XBlock.handler
    def scorm_get_student_state(self, data, _suffix):
        user_id = data.params.get("id")
        block_id = str(data.params.get("block_id"))
        module_state = {}
        response_metadata = {}
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return Response(
                body=f"Invalid 'id' parameter {user_id}", status=400
            )
        try:
            user = User.objects.get(id=user_id)
            usage_key = UsageKey.from_string(block_id)
            course_id = str(usage_key.course_key)
            student_module = StudentModule.objects.filter(student_id=int(user_id),
            course_id=course_id,module_state_key=block_id).first()
            if student_module and student_module.state:
                module_state = json.loads(student_module.state)
                if "completion_token" in module_state.keys():
                    module_state['completion_token'] = 0
                    student_module.state = json.dumps(module_state)
                    student_module.save()
        except Exception as e:
            logging.info('exception occured')
            logging.info(e)
        response_metadata = {'completion_token': self.completion_token}
        return self.json_response({'result': 'success','response_metadata':response_metadata})

    
    
    def student_view(self, context=None):
        """
        The primary view of the GuidedRubricXBlock, shown to students
        when viewing courses.
        """
        if len(self.user_response.keys()) == 0:
            try:
                self.last_attempted_phase_id = int(self.block_phases[0]['phase_id'])
            except:
                self.last_attempted_phase_id = 1
        is_initial_phase = True
        if len(self.user_response.keys()) > 0:
            is_initial_phase = False
        user_service = self.runtime.service(self, 'user')
        xb_user = user_service.get_current_user()
        user_role = xb_user.opt_attrs['edx-platform.user_is_staff']
        is_user_staff = False
        if user_role:
            is_user_staff = True
        else:
            is_user_staff = False


        next_phase_id = None
        next_question = None
        if self.last_attempted_phase_id:
            next_phase_id = self.get_next_phase_id()
            next_question = self.get_next_question()

        phase = self.get_phase(self.last_attempted_phase_id)
        button_label = ''
        if phase:
            button_label = phase['button_label']
        
        lms_context = {
            "guided_rubric_xblock": self,
            "next_question": next_question,
            'user_response_details': self.user_response_details(),
            "button_label" : button_label,
            'is_user_staff':is_user_staff,
            "is_last_phase_successful": self.is_last_phase_successful,
            "last_attempted_phase_id": self.last_attempted_phase_id,
            "is_initial_phase": is_initial_phase,
            "block_id": self.scope_ids.usage_id,
        }
        lms_context.update(context or {})
        template = self.render_template("static/html/lms.html", lms_context)
        frag = Fragment(template)
        frag.add_css(self.resource_string("static/css/lms.css"))
        frag.add_javascript(self.resource_string("static/js/src/lms.js"))
        frag.initialize_js('GuidedRubricXBlock')
        return frag


    def build_instructions(self, phase_id, graded_step):
        phase = None
        for item in self.block_phases:
            if int(item.get('phase_id')) == phase_id:
                phase = item
                break
        if graded_step and phase.get('scored_question', None):
            compiled_instructions = """Please provide a score for the previous user message in this thread. Use the following rubric:
            """ + phase["rubric"] + """
            Please output your response as JSON, using this format: { "[criteria 1]": "[score 1]", "[criteria 2]": "[score 2]", "total": "[total score]" }"""
        else:
            compiled_instructions = phase["ai_instructions"] + phase["phase_question"]

        return compiled_instructions

    @XBlock.json_handler
    def reset_user_responses(self, data, suffix=''):
        self.user_response = {}
        return {"result": "success", "errors": []}

    def handle_assistant_interaction(self, index, manager, user_input):
        manager.add_message_to_thread(
            role="user", content=user_input
        )
        instructions = self.build_instructions(index, False)
        manager.run_assistant(instructions, False)
        summary = manager.get_summary()
        return summary


    def extract_score(self, text):
        # Define the regular expression pattern
        #regex has been modified to grab the total value whether or not it is returned inside double quotes. The AI seems to fluctuate between using quotes around values and not. 
        pattern = r'"total":\s*"?(\d+)"?'
        
        # Use regex to find the score pattern in the text
        match = re.search(pattern, text)

        # If a match is found, return the score, otherwise return None
        if match:
            return int(match.group(1))
        else:
            return 0

    
    def check_score(self, score, phase_id):
        phase = self.get_phase(phase_id)
        if score >= int(phase["minimum_score"]):
            return True
        else:
            return False
    

    def handle_assistant_grading(self, index, manager):
        phase = self.get_phase(self.last_attempted_phase_id)
        if not phase['scored_question']:
            self.last_attempted_phase_id = self.get_next_phase_id()
            self.is_last_phase_successful = True
            return "Success"
        instructions = self.build_instructions(index, True)
        manager.run_assistant(instructions, True)
        summary = manager.get_summary()
        score = self.extract_score(str(summary))
        phase_state = None
        #If the score passes, then increase the index to move to the next step                
        if self.check_score(score, index):
            self.last_attempted_phase_id = self.get_next_phase_id()
            phase_state = "Success"
            self.is_last_phase_successful = True
        else:
            phase_state = "Fail"
            self.is_last_phase_successful = False
        return phase_state


    def handle_skip(self):
        self.last_attempted_phase_id = self.get_next_phase_id()
        self.is_last_phase_successful = True


    def handle_interaction(self, user_input):

        AssistantManager.assistant_id = self.assistant_id
        AssistantManager.thread_id = self.open_ai_thread_id
        manager = AssistantManager()
        if not self.open_ai_thread_id:    
            thread_id = manager.create_thread()
            self.open_ai_thread_id = thread_id
        
        if True:
            hand_intr = None
            hand_gra = None
            if not self.last_attempted_phase_id:
                return hand_intr, hand_gra, None, None, [], self.completion_message
            else:
                index = int(self.last_attempted_phase_id)
            if user_input == "skip":
                self.handle_skip()
                hand_intr = None
                hand_gra = None
            elif self.last_attempted_phase_id <= self.last_phase_id:
                hand_intr = self.handle_assistant_interaction(index, manager, user_input)
                hand_gra = self.handle_assistant_grading(index, manager)
            try:
                phase = self.get_phase(self.last_attempted_phase_id)
                question = phase['phase_question']
                button_label = phase['button_label']
            except:
                question = None
                button_label = None
            messages_to_send = ai_messages.copy()
            ai_messages.clear()
        return hand_intr, hand_gra, question, button_label, messages_to_send, self.completion_message

    # TO-DO: change this handler to perform your own actions.  You may need more
    # than one handler, or you may not need any handlers at all.
    @XBlock.json_handler
    def send_message(self, data, suffix=""):
        """Send message to OpenAI, and return the response"""

        phase = self.get_phase(self.last_attempted_phase_id)
        response_metadata = {'attempted_phase_id': self.last_attempted_phase_id, 'attempted_phase_question':\
        phase['phase_question']}
        self.user_response[self.last_attempted_phase_id] = data['message']
        user_input = data['message']
        phase_id = int(self.last_attempted_phase_id)
        res = self.handle_interaction(user_input)
        if self.user_response.get(phase_id):
            user_response = self.user_response
            phase_response = {}
            phase_response['user_response'] = data['message']
            phase_response['ai_response'] = res[0]
            user_response[phase_id] = phase_response
            self.user_response = user_response
        else:
            user_response = self.user_response
            phase_response = {}
            phase_response['user_response'] = data['message']
            phase_response['ai_response'] = res[0]
            user_response[phase_id] = phase_response
            self.user_response = user_response

        self.completion_token += 1
        attempted_phase_is_last = False
        if response_metadata['attempted_phase_id'] == int(self.last_phase_id):
            attempted_phase_is_last = True
        response_metadata.update({'completion_token': self.completion_token,\
        'is_attempted_phase_successful': self.is_last_phase_successful, 'attempted_phase_is_last': attempted_phase_is_last})

        return {'result': 'success' if res else 'failed', 'response': res, 'response_metadata': response_metadata}

    
    @XBlock.json_handler
    def update_last_phase_id(self, data, suffix=""):
        """Send message to OpenAI, and return the response"""
        self.last_attempted_phase_id = data['last_attempted_phase_id']
        res = {'success': True}
        return {'result': 'success' if res else 'failed', 'response': res}

    # TO-DO: change this to create the scenarios you'd like to see in the
    # workbench while developing your XBlock.
    @staticmethod
    def workbench_scenarios():
        """A canned scenario for display in the workbench."""
        return [
            ("GuidedRubricXBlock",
             """<guidedrubric/>
             """),
            ("Multiple GuidedRubricXBlock",
             """<vertical_demo>
                <guidedrubric/>
                <guidedrubric/>
                <guidedrubric/>
                </vertical_demo>
             """),
        ]
    @property
    def storage(self):
        """
        Return the storage backend used to store the assets of this xblock. This is a cached property.
        """
        if not getattr(self, "_storage", None):

            def get_default_storage(_xblock):
                return default_storage

            storage_func = self.xblock_settings.get("STORAGE_FUNC", get_default_storage)
            if isinstance(storage_func, string_types):
                storage_func = import_string(storage_func)
            self._storage = storage_func(self)

        return self._storage

    @property
    def xblock_settings(self):
        """
        Return a dict of settings associated to this XBlock.
        """
        settings_service = self.runtime.service(self, "settings") or {}
        if not settings_service:
            return {}
        return settings_service.get_settings_bucket(self)


def parse_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_float(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_validate_positive_float(value, name):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError(
            f"Could not parse value of '{name}' (must be float): {value}"
        )
    if parsed < 0:
        raise ValueError(f"Value of '{name}' must not be negative: {value}")
    return parsed


class ScormError(Exception):
    pass

